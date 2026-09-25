import type { ISODate } from "@app/domain/dates";
import { desiredTodos, diffTodos, fingerprint } from "@app/domain/todo";
import type { Settings } from "@app/domain/types";
import type { TodoistApi } from "@app/integrations/todoist/api";
import type { MealPrepDB } from "./db";
import { getOrCreateWeek, updateSettings } from "./repo";

export const TODOIST_PROJECT_NAME = "Meal Prep";

type TodoistSettings = NonNullable<Settings["todoist"]>;

async function todoistSettings(db: MealPrepDB): Promise<TodoistSettings> {
  const s = await db.settings.get("default");
  if (!s?.todoist?.token)
    throw new Error("Primero guarda tu token de Todoist.");
  return s.todoist;
}

/** Id del proyecto "Meal Prep"; lo crea si no existe o si lo borraste en Todoist. */
async function ensureProject(db: MealPrepDB, api: TodoistApi): Promise<string> {
  const t = await todoistSettings(db);
  const projects = await api.listProjects();
  const known =
    projects.find((p) => p.id === t.projectId) ??
    projects.find((p) => p.name === TODOIST_PROJECT_NAME);
  const id = known?.id ?? (await api.createProject(TODOIST_PROJECT_NAME)).id;
  if (id !== t.projectId)
    await updateSettings(db, { todoist: { ...t, projectId: id } });
  return id;
}

export interface TodoPushResult {
  created: number;
  updated: number;
  removed: number;
  /** Tachadas o borradas en Todoist: no se recrean. */
  closed: number;
}

/** Deja el proyecto "Meal Prep" de Todoist igual a las tareas cortas de la semana. */
export async function pushTodos(
  db: MealPrepDB,
  api: TodoistApi,
  weekStart: ISODate,
): Promise<TodoPushResult> {
  const settings = await db.settings.get("default");
  const timeZone = settings?.timeZone ?? "America/Lima";
  const projectId = await ensureProject(db, api);
  const plan = await getOrCreateWeek(db, weekStart);
  const desired = desiredTodos(plan, timeZone);
  const sent = await db.todoSent.where("weekStart").equals(weekStart).toArray();
  const active = new Set((await api.listTasks(projectId)).map((t) => t.id));
  const diff = diffTodos(desired, sent, active);

  for (const todo of diff.create) {
    const task = await api.createTask({
      content: todo.content,
      description: todo.description,
      project_id: projectId,
      due_datetime: todo.dueUtc,
    });
    await db.todoSent.put({
      key: todo.key,
      weekStart,
      taskId: task.id,
      fingerprint: fingerprint(todo),
    });
  }
  for (const { taskId, todo } of diff.update) {
    await api.updateTask(taskId, {
      content: todo.content,
      due_datetime: todo.dueUtc,
    });
    await db.todoSent.put({
      key: todo.key,
      weekStart,
      taskId,
      fingerprint: fingerprint(todo),
    });
  }
  for (const s of diff.remove) {
    await api.deleteTask(s.taskId);
    await db.todoSent.delete(s.key);
  }

  const t = await todoistSettings(db);
  await updateSettings(db, {
    todoist: { ...t, lastPushAt: new Date().toISOString() },
  });
  return {
    created: diff.create.length,
    updated: diff.update.length,
    removed: diff.remove.length,
    closed: diff.closed.length,
  };
}
