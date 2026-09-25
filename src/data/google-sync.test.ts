import "fake-indexeddb/auto";
import type { GEvent } from "@app/domain/gcal";
import type {
  CalendarApi,
  EventQuery,
  GCalendar,
} from "@app/integrations/google/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MealPrepDB } from "./db";
import { discoverCalendars, pullWeeks, pushWeek } from "./google-sync";
import {
  actOnPortion,
  getOrCreateWeek,
  seedIfEmpty,
  updateSettings,
} from "./repo";

/** Google Calendar en memoria: calendarios, eventos y filtro por extendedProperties. */
function fakeApi(calendars: GCalendar[], events: Record<string, GEvent[]>) {
  let seq = 0;
  const calls = { insert: 0, patch: 0, remove: 0 };
  const api: CalendarApi = {
    listCalendars: async () => calendars,
    listEvents: async (calId: string, q: EventQuery) => {
      const all = events[calId] ?? [];
      if (!q.privateExtendedProperty) return all;
      const [k, v] = q.privateExtendedProperty.split("=");
      return all.filter((e) => e.extendedProperties?.private?.[k] === v);
    },
    createCalendar: async (summary) => {
      const id = `cal-${++seq}`;
      calendars.push({ id, summary });
      events[id] = [];
      return { id };
    },
    insertEvent: async (calId, body) => {
      calls.insert++;
      const b = body as GEvent;
      const e = {
        ...b,
        id: `ev-${++seq}`,
        start: { dateTime: `${b.start.dateTime}-05:00` },
        end: { dateTime: `${b.end.dateTime}-05:00` },
      };
      events[calId].push(e);
      return e;
    },
    patchEvent: async (calId, id, body) => {
      calls.patch++;
      const b = body as GEvent;
      const list = events[calId];
      const i = list.findIndex((e) => e.id === id);
      list[i] = {
        ...b,
        id,
        start: { dateTime: `${b.start.dateTime}-05:00` },
        end: { dateTime: `${b.end.dateTime}-05:00` },
      };
      return list[i];
    },
    deleteEvent: async (calId, id) => {
      calls.remove++;
      events[calId] = events[calId].filter((e) => e.id !== id);
    },
  };
  return { api, calls, events, calendars };
}

const course = (
  id: string,
  day: string,
  from: string,
  to: string,
  location: string,
): GEvent => ({
  id,
  summary: id,
  location,
  start: { dateTime: `${day}T${from}:00-05:00` },
  end: { dateTime: `${day}T${to}:00-05:00` },
});

let db: MealPrepDB;
let n = 0;
beforeEach(async () => {
  db = new MealPrepDB(`gsync-${n++}`);
  await seedIfEmpty(db);
});
afterEach(async () => {
  await db.delete();
});

describe("discoverCalendars", () => {
  it("sugiere Utec Courses como fijo y el principal como flexible", async () => {
    const { api } = fakeApi(
      [
        { id: "utec", summary: "Utec Courses" },
        { id: "me@utec.edu.pe", summary: "me@utec.edu.pe", primary: true },
        { id: "todo", summary: "Todoist" },
      ],
      {},
    );
    expect(
      (await discoverCalendars(api)).map((c) => [c.id, c.suggested]),
    ).toEqual([
      ["utec", "fixed"],
      ["me@utec.edu.pe", "flexible"],
      ["todo", "ignore"],
    ]);
  });
});

describe("pullWeeks", () => {
  it("un trabajo en el principal mueve el gym del jueves y conserva lo ya hecho", async () => {
    const { api } = fakeApi([], {
      utec: [
        course(
          "ML",
          "2026-10-01",
          "07:00",
          "09:00",
          "https://utec.zoom.us/j/1",
        ),
        course("EDA", "2026-10-02", "13:00", "15:00", "M804"),
      ],
      primary: [course("Trabajo grupal", "2026-10-01", "14:00", "18:00", "")],
    });
    await updateSettings(db, {
      google: { fixedCalendarIds: ["utec"], flexibleCalendarIds: ["primary"] },
    });
    const plan = await getOrCreateWeek(db, "2026-09-27");
    const lunes = plan.portions.find(
      (p) => p.eatOn === "2026-09-28" && p.slot === "almuerzo",
    );
    if (!lunes) throw new Error("falta lunes");
    await actOnPortion(db, lunes.id, "pack");

    const res = await pullWeeks(db, api, ["2026-09-27"]);
    expect(res.events).toBe(3);

    const after = await getOrCreateWeek(db, "2026-09-27");
    const gymJue = after.sessions.find(
      (s) => s.kind === "gym" && s.date === "2026-10-01",
    );
    expect(gymJue?.start).toBe("18:00");
    expect(after.portions.find((p) => p.id === lunes.id)?.state).toBe("packed");
  });
});

describe("pushWeek", () => {
  it("crea 'Meal Prep' la primera vez y no duplica al repetir", async () => {
    const fake = fakeApi([], {});
    await updateSettings(db, {
      google: { fixedCalendarIds: [], flexibleCalendarIds: [] },
    });

    const first = await pushWeek(db, fake.api, "2026-09-27");
    expect(first.created).toBeGreaterThan(5);
    expect(fake.calendars.map((c) => c.summary)).toEqual(["Meal Prep"]);

    const second = await pushWeek(db, fake.api, "2026-09-27");
    expect(second).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(fake.calendars).toHaveLength(1);
    expect(
      (await db.settings.get("default"))?.google?.lastPushAt,
    ).toBeDefined();
  });

  it("si borraste el calendario en Google, lo vuelve a crear", async () => {
    const fake = fakeApi([], {});
    await updateSettings(db, {
      google: {
        fixedCalendarIds: [],
        flexibleCalendarIds: [],
        targetCalendarId: "borrado",
      },
    });
    await pushWeek(db, fake.api, "2026-09-27");
    const s = await db.settings.get("default");
    expect(s?.google?.targetCalendarId).not.toBe("borrado");
  });
});
