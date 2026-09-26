import { type ISODate, zonedToUtcIso } from "./dates";
import { SHORT_TASK_KINDS } from "./todo";
import type { WeekPlan } from "./types";

/** Aviso push programado en el backend (llega aunque la app esté cerrada). */
export interface PushReminder {
  key: string;
  title: string;
  body: string;
  /** Pantalla que se abre al tocar el aviso. */
  url: string;
  /** Instante UTC (ISO). */
  fireAt: string;
}

const PREP_HEADS_UP_MIN = 30;

function minusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) - minutes * 60_000).toISOString();
}

/**
 * Avisos de la semana:
 * - tareas cortas a su hora (descongelar, congelar, lonchera),
 * - meal prep 30 min antes de empezar.
 * El gym no se avisa: ya está en tu calendario.
 */
export function weekReminders(
  plan: WeekPlan,
  timeZone: string,
): PushReminder[] {
  const out: PushReminder[] = [];
  for (const t of plan.tasks) {
    if (!SHORT_TASK_KINDS.includes(t.kind) || !t.time) continue;
    out.push({
      key: `${t.kind}|${t.portionId ?? t.date}`,
      title: t.label,
      body: t.kind === "pack" ? "Antes de salir a la U." : "",
      url: "/hoy",
      fireAt: zonedToUtcIso(t.date, t.time, timeZone),
    });
  }
  for (const s of plan.sessions) {
    if (s.kind !== "prep") continue;
    const start = zonedToUtcIso(s.date, s.start, timeZone);
    out.push({
      key: `prep|${s.refId ?? s.date}`,
      title: `En ${PREP_HEADS_UP_MIN} min: ${s.title}`,
      body: "Abre Cocina para la guía paso a paso.",
      url: "/cocina",
      fireAt: minusMinutes(start, PREP_HEADS_UP_MIN),
    });
  }
  return out;
}

export interface CookTimer {
  prepId: string;
  stepId: string;
  minutes: number;
  /** Epoch ms. */
  startedAt: number;
  label: string;
}

/** Temporizadores de cocina activos → avisos (suenan aunque cierres la app). */
export function timerReminders(
  timers: CookTimer[],
  now: number,
): PushReminder[] {
  return timers.flatMap((t) => {
    const fireAt = t.startedAt + t.minutes * 60_000;
    if (fireAt <= now) return [];
    return [
      {
        key: `${t.prepId}|${t.stepId}|${t.startedAt}`,
        title: `Listo: ${t.label}`,
        body: `${t.minutes} min`,
        url: "/cocina",
        fireAt: new Date(fireAt).toISOString(),
      },
    ];
  });
}

/** Solo lo que todavía no pasó (el backend descarta lo atrasado de todos modos). */
export function upcoming(
  reminders: PushReminder[],
  now: number,
): PushReminder[] {
  return reminders.filter((r) => Date.parse(r.fireAt) > now);
}

export const cookScope = (date: ISODate) => `cook-${date}`;
