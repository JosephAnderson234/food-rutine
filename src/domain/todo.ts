import { type ISODate, zonedToUtcIso } from "./dates";
import type { TaskKind, WeekPlan } from "./types";

/** Tareas cortas que van a una app de tareas (y no como bloque de calendario). */
export const SHORT_TASK_KINDS: TaskKind[] = [
  "thaw",
  "freeze",
  "pack",
  "gelpacks",
];

export interface TodoOut {
  key: string;
  content: string;
  description: string;
  date: ISODate;
  /** Instante UTC de la tarea (RFC 3339). */
  dueUtc: string;
}

export function desiredTodos(plan: WeekPlan, timeZone: string): TodoOut[] {
  return plan.tasks.flatMap((t) => {
    if (!SHORT_TASK_KINDS.includes(t.kind) || !t.time) return [];
    return [
      {
        key: `${plan.weekStart}|${t.kind}|${t.portionId ?? t.date}`,
        content: t.label,
        description: "Creada por Meal Prep. Márcala aquí o en la app.",
        date: t.date,
        dueUtc: zonedToUtcIso(t.date, t.time, timeZone),
      },
    ];
  });
}

/** Lo que la app recuerda haber enviado (para no duplicar ni revivir lo tachado). */
export interface SentTodo {
  key: string;
  taskId: string;
  fingerprint: string;
}

export const fingerprint = (t: TodoOut) => `${t.content}|${t.dueUtc}`;

export interface TodoDiff {
  create: TodoOut[];
  update: { taskId: string; todo: TodoOut }[];
  remove: SentTodo[];
  /** Enviadas antes y ya no activas: se completaron o borraron en la app de tareas. */
  closed: SentTodo[];
}

/**
 * Cambios mínimos contra lo enviado.
 * - Lo tachado o borrado en Todoist no se vuelve a crear.
 * - Solo se tocan tareas aún activas.
 */
export function diffTodos(
  desired: TodoOut[],
  sent: SentTodo[],
  activeIds: Set<string>,
): TodoDiff {
  const byKey = new Map(sent.map((s) => [s.key, s]));
  const wanted = new Set(desired.map((d) => d.key));
  const diff: TodoDiff = { create: [], update: [], remove: [], closed: [] };
  for (const d of desired) {
    const s = byKey.get(d.key);
    if (!s) diff.create.push(d);
    else if (!activeIds.has(s.taskId)) continue;
    else if (s.fingerprint !== fingerprint(d))
      diff.update.push({ taskId: s.taskId, todo: d });
  }
  for (const s of sent) {
    const active = activeIds.has(s.taskId);
    if (!active) diff.closed.push(s);
    else if (!wanted.has(s.key)) diff.remove.push(s);
  }
  return diff;
}
