import "fake-indexeddb/auto";
import type {
  TaskBody,
  TodoistApi,
  TProject,
  TTask,
} from "@app/integrations/todoist/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MealPrepDB } from "./db";
import { seedIfEmpty, updateSettings } from "./repo";
import { pushTodos } from "./todoist-sync";

function fakeTodoist() {
  let seq = 0;
  const projects: TProject[] = [];
  const tasks: (TTask & { project_id?: string; due_datetime?: string })[] = [];
  const api: TodoistApi = {
    listProjects: async () => projects,
    createProject: async (name) => {
      const p = { id: `p${++seq}`, name };
      projects.push(p);
      return p;
    },
    listTasks: async (projectId) =>
      tasks.filter((t) => t.project_id === projectId),
    createTask: async (body: TaskBody) => {
      const t = { id: `t${++seq}`, ...body };
      tasks.push(t);
      return t;
    },
    updateTask: async (id, body) => {
      Object.assign(tasks.find((t) => t.id === id) ?? {}, body);
    },
    deleteTask: async (id) => {
      const i = tasks.findIndex((t) => t.id === id);
      if (i >= 0) tasks.splice(i, 1);
    },
  };
  return { api, projects, tasks };
}

let db: MealPrepDB;
let n = 0;
beforeEach(async () => {
  db = new MealPrepDB(`todoist-${n++}`);
  await seedIfEmpty(db);
  await updateSettings(db, { todoist: { token: "x" } });
});
afterEach(async () => {
  await db.delete();
});

describe("pushTodos", () => {
  it("crea el proyecto y las tareas con hora; repetir no duplica", async () => {
    const fake = fakeTodoist();
    const first = await pushTodos(db, fake.api, "2026-09-27");
    expect(fake.projects.map((p) => p.name)).toEqual(["Meal Prep"]);
    expect(first.created).toBe(fake.tasks.length);
    expect(
      fake.tasks.some((t) => t.due_datetime === "2026-09-30T02:00:00.000Z"),
    ).toBe(true);

    const second = await pushTodos(db, fake.api, "2026-09-27");
    expect(second).toEqual({ created: 0, updated: 0, removed: 0, closed: 0 });
  });

  it("lo que tachaste en Todoist no vuelve a aparecer", async () => {
    const fake = fakeTodoist();
    await pushTodos(db, fake.api, "2026-09-27");
    const total = fake.tasks.length;
    fake.tasks.splice(0, 1); // tachada = ya no está entre las activas
    const again = await pushTodos(db, fake.api, "2026-09-27");
    expect(again.created).toBe(0);
    expect(again.closed).toBe(1);
    expect(fake.tasks).toHaveLength(total - 1);
  });

  it("reutiliza un proyecto 'Meal Prep' existente", async () => {
    const fake = fakeTodoist();
    fake.projects.push({ id: "mine", name: "Meal Prep" });
    await pushTodos(db, fake.api, "2026-09-27");
    expect(fake.projects).toHaveLength(1);
    expect((await db.settings.get("default"))?.todoist?.projectId).toBe("mine");
  });
});
