import { describe, expect, it } from "vitest";
import { seedWeek } from "../test/fixtures";
import { desiredTodos, diffTodos, fingerprint, type SentTodo } from "./todo";

const plan = seedWeek();
const todos = desiredTodos(plan, "America/Lima");
const sentFrom = (list = todos): SentTodo[] =>
  list.map((t, i) => ({
    key: t.key,
    taskId: `t${i}`,
    fingerprint: fingerprint(t),
  }));

describe("desiredTodos", () => {
  it("solo tareas cortas con hora: descongelar, congelar y lonchera", () => {
    const kinds = new Set(todos.map((t) => t.key.split("|")[1]));
    expect(kinds).toEqual(new Set(["thaw", "freeze", "pack"]));
  });

  it("la hora de Lima va como instante UTC", () => {
    const thaw = todos.find(
      (t) => t.key.startsWith("2026-09-27|thaw") && t.date === "2026-09-29",
    );
    expect(thaw?.dueUtc).toBe("2026-09-30T02:00:00.000Z");
    expect(thaw?.content).toContain("Pasar taper #5");
  });
});

describe("diffTodos", () => {
  it("primera vez crea todo; con todo activo y sin cambios no hace nada", () => {
    expect(diffTodos(todos, [], new Set()).create).toHaveLength(todos.length);
    const sent = sentFrom();
    const active = new Set(sent.map((s) => s.taskId));
    expect(diffTodos(todos, sent, active)).toEqual({
      create: [],
      update: [],
      remove: [],
      closed: [],
    });
  });

  it("lo tachado en Todoist no se vuelve a crear", () => {
    const sent = sentFrom();
    const active = new Set(sent.slice(1).map((s) => s.taskId));
    const diff = diffTodos(todos, sent, active);
    expect(diff.create).toEqual([]);
    expect(diff.closed.map((c) => c.taskId)).toEqual(["t0"]);
  });

  it("si cambia la hora actualiza; si ya no hace falta la borra", () => {
    const sent = sentFrom();
    const active = new Set(sent.map((s) => s.taskId));
    const next = todos
      .slice(1)
      .map((t, i) =>
        i === 0 ? { ...t, dueUtc: "2026-09-30T03:00:00.000Z" } : t,
      );
    const diff = diffTodos(next, sent, active);
    expect(diff.update.map((u) => u.taskId)).toEqual(["t1"]);
    expect(diff.remove.map((r) => r.taskId)).toEqual(["t0"]);
  });
});
