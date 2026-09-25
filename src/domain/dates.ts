/**
 * Fechas como strings locales ("YYYY-MM-DD" / "HH:mm") para evitar problemas de zona horaria.
 * Toda la aritmética se hace en UTC sobre la fecha civil, así el resultado no depende del huso del dispositivo.
 */

export type ISODate = string;
export type HHmm = string;
/** 0 = domingo … 6 = sábado (igual que Date#getUTCDay). La semana del plan arranca en domingo. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_SHORT = [
  "Dom",
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
] as const;
export const WEEKDAY_LONG = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

const DAY_MS = 86_400_000;

function toUTC(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

/** b − a, en días. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function weekdayOf(date: ISODate): Weekday {
  return new Date(toUTC(date)).getUTCDay() as Weekday;
}

/** Domingo de la semana que contiene `date`. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, -weekdayOf(date));
}

export function toMinutes(time: HHmm): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): HHmm {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Fecha civil de hoy en una zona IANA (por defecto Lima). */
export function todayIn(timeZone = "America/Lima", now = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** Minutos desde la medianoche en una zona IANA (por defecto Lima). */
export function minutesIn(timeZone = "America/Lima", now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}
