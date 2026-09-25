import { addDays, diffDays, type ISODate } from "@app/domain/dates";
import {
  desiredEvents,
  diffOutbound,
  fromGoogle,
  toExisting,
  toGoogleBody,
} from "@app/domain/gcal";
import type { Settings } from "@app/domain/types";
import { type CalendarApi, GoogleApiError } from "@app/integrations/google/api";
import type { MealPrepDB } from "./db";
import {
  getOrCreateWeek,
  regenerateWeek,
  saveCalendarCache,
  updateSettings,
} from "./repo";

export const TARGET_CALENDAR_NAME = "Meal Prep";

export type CalendarRole = "fixed" | "flexible" | "ignore";

export interface DiscoveredCalendar {
  id: string;
  summary: string;
  primary: boolean;
  suggested: CalendarRole;
}

/** Calendarios de la cuenta con un rol sugerido: cursos = fijo, principal = flexible. */
export async function discoverCalendars(
  api: CalendarApi,
): Promise<DiscoveredCalendar[]> {
  const cals = await api.listCalendars();
  return cals
    .filter((c) => c.summary !== TARGET_CALENDAR_NAME)
    .map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: Boolean(c.primary),
      suggested: /cursos?|courses|clases/i.test(c.summary)
        ? "fixed"
        : c.primary
          ? "flexible"
          : "ignore",
    }));
}

type GoogleSettings = NonNullable<Settings["google"]>;

async function googleSettings(db: MealPrepDB): Promise<GoogleSettings> {
  const s = await db.settings.get("default");
  if (!s?.google) throw new Error("Primero elige qué calendarios usar.");
  return s.google;
}

/** Ventana amplia en UTC; luego se filtra por fecha local para no depender del huso. */
function weekWindow(weekStart: ISODate) {
  return {
    timeMin: `${addDays(weekStart, -1)}T00:00:00Z`,
    timeMax: `${addDays(weekStart, 8)}T00:00:00Z`,
  };
}

/**
 * Trae de Google los eventos de esas semanas, los guarda en caché (para usar sin internet)
 * y recalcula los planes existentes conservando lo ya cocinado.
 */
export async function pullWeeks(
  db: MealPrepDB,
  api: CalendarApi,
  weekStarts: ISODate[],
): Promise<{ events: number }> {
  const settings = await db.settings.get("default");
  const google = await googleSettings(db);
  const timeZone = settings?.timeZone ?? "America/Lima";
  let total = 0;
  for (const weekStart of weekStarts) {
    const w = weekWindow(weekStart);
    const sources = [
      ...google.fixedCalendarIds.map((id) => ({ id, kind: "fixed" as const })),
      ...google.flexibleCalendarIds.map((id) => ({
        id,
        kind: "flexible" as const,
      })),
    ];
    const events = (
      await Promise.all(
        sources.map(async ({ id, kind }) =>
          fromGoogle(await api.listEvents(id, w), {
            calendarId: id,
            kind,
            timeZone,
          }),
        ),
      )
    )
      .flat()
      .filter((e) => {
        const d = diffDays(weekStart, e.date);
        return d >= 0 && d <= 6;
      });
    await saveCalendarCache(db, weekStart, events);
    if (await db.weeks.get(weekStart)) await regenerateWeek(db, weekStart);
    total += events.length;
  }
  await updateSettings(db, {
    google: { ...google, lastPullAt: new Date().toISOString() },
  });
  return { events: total };
}

/** Id del calendario "Meal Prep"; lo crea si no existe o si lo borraste en Google. */
async function ensureTarget(
  db: MealPrepDB,
  api: CalendarApi,
  timeZone: string,
): Promise<string> {
  const google = await googleSettings(db);
  if (google.targetCalendarId) {
    const exists = (await api.listCalendars()).some(
      (c) => c.id === google.targetCalendarId,
    );
    if (exists) return google.targetCalendarId;
  }
  const { id } = await api.createCalendar(TARGET_CALENDAR_NAME, timeZone);
  await updateSettings(db, { google: { ...google, targetCalendarId: id } });
  return id;
}

export interface PushResult {
  created: number;
  updated: number;
  removed: number;
}

/** Deja el calendario "Meal Prep" igual al plan de la semana (sin duplicar). */
export async function pushWeek(
  db: MealPrepDB,
  api: CalendarApi,
  weekStart: ISODate,
): Promise<PushResult> {
  const settings = await db.settings.get("default");
  const timeZone = settings?.timeZone ?? "America/Lima";
  const target = await ensureTarget(db, api, timeZone);
  const plan = await getOrCreateWeek(db, weekStart);

  let existingRaw: Awaited<ReturnType<CalendarApi["listEvents"]>>;
  try {
    existingRaw = await api.listEvents(target, {
      ...weekWindow(weekStart),
      privateExtendedProperty: `mealprepWeek=${weekStart}`,
    });
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 404) existingRaw = [];
    else throw e;
  }
  const existing = existingRaw.flatMap((e) => {
    const x = toExisting(e, timeZone);
    return x ? [x] : [];
  });
  const diff = diffOutbound(desiredEvents(plan), existing);

  for (const e of diff.create)
    await api.insertEvent(target, toGoogleBody(e, weekStart, timeZone));
  for (const u of diff.update)
    await api.patchEvent(
      target,
      u.googleId,
      toGoogleBody(u.event, weekStart, timeZone),
    );
  for (const id of diff.remove) await api.deleteEvent(target, id);

  const google = await googleSettings(db);
  await updateSettings(db, {
    google: { ...google, lastPushAt: new Date().toISOString() },
  });
  return {
    created: diff.create.length,
    updated: diff.update.length,
    removed: diff.remove.length,
  };
}
