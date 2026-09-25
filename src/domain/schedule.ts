import {
  addDays,
  fromMinutes,
  type HHmm,
  type ISODate,
  toMinutes,
} from "./dates";
import type { FixedCourse, Modality, ScheduleEvent } from "./types";

type Interval = [number, number];

/** Un link en la ubicación (Zoom, Meet…) indica clase virtual. */
export function modalityFromLocation(location?: string): Modality {
  return location && /^https?:\/\//i.test(location.trim())
    ? "virtual"
    : "presencial";
}

/** Convierte los cursos recurrentes en eventos concretos de la semana que empieza en `weekStart` (domingo). */
export function expandFixedCourses(
  courses: FixedCourse[],
  weekStart: ISODate,
): ScheduleEvent[] {
  return courses.map((c) => ({
    id: `${c.id}@${addDays(weekStart, c.weekday)}`,
    title: c.title,
    date: addDays(weekStart, c.weekday),
    start: c.start,
    end: c.end,
    kind: "fixed",
    modality: c.modality,
    source: "seed",
  }));
}

export function eventsOn(
  events: ScheduleEvent[],
  date: ISODate,
): ScheduleEvent[] {
  return events
    .filter((e) => e.date === date)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

function busy(
  events: ScheduleEvent[],
  date: ISODate,
  includeFlexible: boolean,
): Interval[] {
  return eventsOn(events, date)
    .filter((e) => includeFlexible || e.kind === "fixed")
    .map((e) => [toMinutes(e.start), toMinutes(e.end)] as Interval);
}

function overlaps(a: Interval, b: Interval): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export interface SlotQuery {
  date: ISODate;
  durationMin: number;
  window: { from: HHmm; to: HHmm };
  /** Se prueba primero desde aquí hacia adelante y luego hacia atrás. */
  preferredStart?: HHmm;
  /** Por defecto los eventos flexibles también bloquean. */
  includeFlexible?: boolean;
  stepMin?: number;
}

/** Primer hueco libre que cumpla la consulta, o null. */
export function findSlot(
  events: ScheduleEvent[],
  q: SlotQuery,
): { start: HHmm; end: HHmm } | null {
  const step = q.stepMin ?? 15;
  const from = toMinutes(q.window.from);
  const lastStart = toMinutes(q.window.to) - q.durationMin;
  if (lastStart < from) return null;

  const pref = Math.min(
    Math.max(q.preferredStart ? toMinutes(q.preferredStart) : from, from),
    lastStart,
  );
  const candidates: number[] = [];
  for (let t = pref; t <= lastStart; t += step) candidates.push(t);
  for (let t = pref - step; t >= from; t -= step) candidates.push(t);

  const blocked = busy(events, q.date, q.includeFlexible ?? true);
  for (const start of candidates) {
    const slot: Interval = [start, start + q.durationMin];
    if (!blocked.some((b) => overlaps(slot, b))) {
      return { start: fromMinutes(start), end: fromMinutes(slot[1]) };
    }
  }
  return null;
}

/** Rango en que hay que estar en el campus (primera a última clase presencial fija). */
export function campusSpan(
  events: ScheduleEvent[],
  date: ISODate,
): { from: HHmm; to: HHmm } | null {
  const onSite = eventsOn(events, date).filter(
    (e) => e.kind === "fixed" && e.modality === "presencial",
  );
  if (onSite.length === 0) return null;
  return {
    from: onSite[0].start,
    to: onSite.reduce(
      (max, e) => (toMinutes(e.end) > toMinutes(max) ? e.end : max),
      onSite[0].end,
    ),
  };
}

/** ¿El almuerzo cae mientras estás en el campus? */
export function lunchAtCampus(
  events: ScheduleEvent[],
  date: ISODate,
  lunchWindow: { from: HHmm; to: HHmm },
): boolean {
  const span = campusSpan(events, date);
  if (!span) return false;
  return overlaps(
    [toMinutes(span.from), toMinutes(span.to)],
    [toMinutes(lunchWindow.from), toMinutes(lunchWindow.to)],
  );
}
