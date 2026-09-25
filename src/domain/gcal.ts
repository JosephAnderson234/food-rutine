import type { HHmm, ISODate } from "./dates";
import { modalityFromLocation } from "./schedule";
import { SHORT_TASK_KINDS } from "./todo";
import type { ScheduleEvent, WeekPlan } from "./types";

/** Subconjunto de un evento de Google Calendar API v3 que usa la app. */
export interface GEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: "opaque" | "transparent";
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
}

/** Fecha civil y hora local de un instante ISO en una zona IANA. */
export function localParts(
  iso: string,
  timeZone: string,
): { date: ISODate; time: HHmm } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/**
 * Eventos de Google → eventos del horario.
 * Se ignoran: todo el día, cancelados, marcados como "disponible" y rechazados.
 * Un evento que cruza la medianoche se recorta a las 23:59 de su día.
 */
export function fromGoogle(
  events: GEvent[],
  opts: { calendarId: string; kind: "fixed" | "flexible"; timeZone: string },
): ScheduleEvent[] {
  return events.flatMap((e): ScheduleEvent[] => {
    if (e.status === "cancelled" || e.transparency === "transparent") return [];
    if (!e.start.dateTime || !e.end.dateTime) return [];
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined"))
      return [];
    const start = localParts(e.start.dateTime, opts.timeZone);
    const end = localParts(e.end.dateTime, opts.timeZone);
    return [
      {
        id: `g:${opts.calendarId}:${e.id}`,
        title: e.summary?.trim() || "(sin título)",
        date: start.date,
        start: start.time,
        end: end.date === start.date ? end.time : "23:59",
        kind: opts.kind,
        modality:
          opts.kind === "fixed" ? modalityFromLocation(e.location) : undefined,
        source: "google",
      },
    ];
  });
}

// ── Salida: plan → calendario "Meal Prep" ───────────────────────────────────

export interface OutEvent {
  /** Identidad estable del evento para sincronizar sin duplicar. */
  key: string;
  summary: string;
  description?: string;
  date: ISODate;
  start: HHmm;
  end: HHmm;
  /** Minutos antes para la notificación. */
  remindMin: number;
}

/** Lo que el plan de la semana quiere tener en el calendario "Meal Prep". */
export function desiredEvents(
  plan: WeekPlan,
  opts: { shortTasks: "reminder" | "none" } = { shortTasks: "reminder" },
): OutEvent[] {
  const out: OutEvent[] = [];
  for (const s of plan.sessions) {
    if (s.kind === "gym") {
      out.push({
        key: `${plan.weekStart}|gym|${s.date}`,
        summary: "Gym",
        date: s.date,
        start: s.start,
        end: s.end,
        remindMin: 30,
      });
    } else {
      const own = plan.portions.filter((p) => p.prepId === s.refId);
      out.push({
        key: `${plan.weekStart}|prep|${s.refId}`,
        summary: s.title,
        description: [
          `${own.length} porciones. Abre la app en Cocina para la guía paso a paso.`,
          ...own.map(
            (p) =>
              `• ${p.containerNo ? `Táper #${p.containerNo}: ` : ""}${p.label}`,
          ),
        ].join("\n"),
        date: s.date,
        start: s.start,
        end: s.end,
        remindMin: 60,
      });
    }
  }
  // Tareas cortas: si van a una app de tareas no se duplican; si no, recordatorio
  // de 0 minutos (una marca con aviso, sin ocupar un bloque del calendario).
  if (opts.shortTasks === "reminder") {
    for (const t of plan.tasks) {
      if (!SHORT_TASK_KINDS.includes(t.kind) || !t.time) continue;
      out.push({
        key: `${plan.weekStart}|${t.kind}|${t.portionId ?? t.date}`,
        summary: t.label,
        date: t.date,
        start: t.time,
        end: t.time,
        remindMin: 0,
      });
    }
  }
  return out;
}

export interface ExistingOut {
  googleId: string;
  key: string;
  summary: string;
  description?: string;
  date: ISODate;
  start: HHmm;
  end: HHmm;
}

export interface OutDiff {
  create: OutEvent[];
  update: { googleId: string; event: OutEvent }[];
  remove: string[];
}

/** Cambios mínimos para que el calendario refleje el plan. Idempotente. */
export function diffOutbound(
  desired: OutEvent[],
  existing: ExistingOut[],
): OutDiff {
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const wanted = new Set(desired.map((d) => d.key));
  const diff: OutDiff = { create: [], update: [], remove: [] };
  for (const d of desired) {
    const e = byKey.get(d.key);
    if (!e) diff.create.push(d);
    else if (
      e.summary !== d.summary ||
      e.date !== d.date ||
      e.start !== d.start ||
      e.end !== d.end ||
      (e.description ?? "") !== (d.description ?? "")
    ) {
      diff.update.push({ googleId: e.googleId, event: d });
    }
  }
  for (const e of existing)
    if (!wanted.has(e.key)) diff.remove.push(e.googleId);
  return diff;
}

/** Cuerpo para la API de Google a partir de un evento de salida. */
export function toGoogleBody(
  e: OutEvent,
  weekStart: ISODate,
  timeZone: string,
) {
  return {
    summary: e.summary,
    description: e.description,
    start: { dateTime: `${e.date}T${e.start}:00`, timeZone },
    end: { dateTime: `${e.date}T${e.end}:00`, timeZone },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: e.remindMin }],
    },
    extendedProperties: {
      private: { mealprepKey: e.key, mealprepWeek: weekStart },
    },
  };
}

/** Evento de Google creado por la app → forma comparable con `desiredEvents`. */
export function toExisting(e: GEvent, timeZone: string): ExistingOut | null {
  const key = e.extendedProperties?.private?.mealprepKey;
  if (!key || !e.start.dateTime || !e.end.dateTime) return null;
  const start = localParts(e.start.dateTime, timeZone);
  const end = localParts(e.end.dateTime, timeZone);
  return {
    googleId: e.id,
    key,
    summary: e.summary ?? "",
    description: e.description,
    date: start.date,
    start: start.time,
    end: end.time,
  };
}
