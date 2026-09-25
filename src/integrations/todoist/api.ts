/** Cliente mínimo de la API v1 de Todoist (admite CORS: se llama desde el navegador). */

const BASE = "https://api.todoist.com/api/v1";

export class TodoistError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TProject {
  id: string;
  name: string;
}

export interface TTask {
  id: string;
  content: string;
  description?: string;
}

export interface TaskBody {
  content: string;
  description?: string;
  project_id?: string;
  /** Instante UTC RFC 3339. */
  due_datetime: string;
}

/** Lo que necesita la sincronización; en tests se reemplaza por una versión falsa. */
export interface TodoistApi {
  listProjects(): Promise<TProject[]>;
  createProject(name: string): Promise<TProject>;
  listTasks(projectId: string): Promise<TTask[]>;
  createTask(body: TaskBody): Promise<TTask>;
  updateTask(id: string, body: Partial<TaskBody>): Promise<void>;
  deleteTask(id: string): Promise<void>;
}

export function todoistApi(token: string): TodoistApi {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new TodoistError(
        res.status,
        res.status === 401 || res.status === 403
          ? "Token de Todoist inválido o sin permisos."
          : text || res.statusText,
      );
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async function paginate<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({ ...params, limit: "200" });
      if (cursor) q.set("cursor", cursor);
      const page = await call<{ results: T[]; next_cursor: string | null }>(
        `${path}?${q}`,
      );
      out.push(...page.results);
      cursor = page.next_cursor;
    } while (cursor);
    return out;
  }

  return {
    listProjects: () => paginate<TProject>("/projects"),
    createProject: (name) =>
      call<TProject>("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    listTasks: (projectId) =>
      paginate<TTask>("/tasks", { project_id: projectId }),
    createTask: (body) =>
      call<TTask>("/tasks", { method: "POST", body: JSON.stringify(body) }),
    async updateTask(id, body) {
      await call<unknown>(`/tasks/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async deleteTask(id) {
      try {
        await call<void>(`/tasks/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch (e) {
        if (!(e instanceof TodoistError && e.status === 404)) throw e;
      }
    },
  };
}
