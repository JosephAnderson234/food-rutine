import { describe, expect, it } from "vitest";
import { seedWeek } from "../test/fixtures";
import {
  desiredEvents,
  diffOutbound,
  fromGoogle,
  type GEvent,
  localParts,
  toExisting,
  toGoogleBody,
} from "./gcal";

const TZ = "America/Lima";
const ev = (over: Partial<GEvent>): GEvent => ({
  id: "e1",
  summary: "Machine Learning - Teo 3",
  start: { dateTime: "2026-09-28T07:00:00-05:00" },
  end: { dateTime: "2026-09-28T09:00:00-05:00" },
  ...over,
});

describe("entrada desde Google", () => {
  it("convierte a la hora de Lima aunque venga en UTC", () => {
    expect(localParts("2026-09-28T12:00:00Z", TZ)).toEqual({
      date: "2026-09-28",
      time: "07:00",
    });
  });

  it("curso con link de Zoom = fijo y virtual; con aula = presencial", () => {
    const [zoom, aula] = fromGoogle(
      [
        ev({ location: "https://utec.zoom.us/j/1" }),
        ev({ id: "e2", location: "A708" }),
      ],
      { calendarId: "utec", kind: "fixed", timeZone: TZ },
    );
    expect(zoom).toMatchObject({
      date: "2026-09-28",
      start: "07:00",
      end: "09:00",
      kind: "fixed",
      modality: "virtual",
    });
    expect(aula.modality).toBe("presencial");
    expect(aula.id).toBe("g:utec:e2");
  });

  it("ignora todo el día, cancelados, 'disponible' y rechazados", () => {
    const out = fromGoogle(
      [
        ev({
          id: "allday",
          start: { date: "2026-09-28" },
          end: { date: "2026-09-29" },
        }),
        ev({ id: "cancel", status: "cancelled" }),
        ev({ id: "free", transparency: "transparent" }),
        ev({
          id: "nope",
          attendees: [{ self: true, responseStatus: "declined" }],
        }),
        ev({ id: "ok" }),
      ],
      { calendarId: "primary", kind: "flexible", timeZone: TZ },
    );
    expect(out.map((e) => e.id)).toEqual(["g:primary:ok"]);
    expect(out[0].modality).toBeUndefined();
  });

  it("recorta eventos que cruzan la medianoche", () => {
    const [e] = fromGoogle(
      [
        ev({
          start: { dateTime: "2026-09-28T22:00:00-05:00" },
          end: { dateTime: "2026-09-29T01:00:00-05:00" },
        }),
      ],
      { calendarId: "primary", kind: "flexible", timeZone: TZ },
    );
    expect([e.date, e.start, e.end]).toEqual(["2026-09-28", "22:00", "23:59"]);
  });
});

describe("salida hacia 'Meal Prep'", () => {
  const plan = seedWeek();
  const desired = desiredEvents(plan);

  it("gym, meal prep y recordatorios con hora", () => {
    const kinds = desired.map((d) => d.key.split("|")[1]);
    expect(kinds.filter((k) => k === "gym")).toHaveLength(3);
    expect(kinds.filter((k) => k === "prep")).toHaveLength(2);
    expect(kinds).toContain("thaw");
    expect(kinds).toContain("pack");
    expect(kinds).not.toContain("finish");
  });

  it("recordatorios cortos sin duración; con Todoist no van al calendario", () => {
    const thaw = desired.find((d) => d.key.split("|")[1] === "thaw");
    expect(thaw?.start).toBe(thaw?.end);
    expect(thaw?.remindMin).toBe(0);
    const onlyBlocks = desiredEvents(plan, { shortTasks: "none" });
    expect(new Set(onlyBlocks.map((d) => d.key.split("|")[1]))).toEqual(
      new Set(["gym", "prep"]),
    );
  });

  it("el meal prep describe los táperes", () => {
    const dom = desired.find((d) => d.key.endsWith("prep|prep-dom"));
    expect(dom?.description).toContain("Táper #1:");
    expect(dom?.remindMin).toBe(60);
  });

  it("primera vez: crea todo; segunda vez: no hace nada", () => {
    expect(diffOutbound(desired, []).create).toHaveLength(desired.length);
    const existing = desired.map((d, i) => ({ googleId: `g${i}`, ...d }));
    expect(diffOutbound(desired, existing)).toEqual({
      create: [],
      update: [],
      remove: [],
    });
  });

  it("si el gym se mueve, actualiza; si ya no está, lo borra", () => {
    const existing = desired.map((d, i) => ({ googleId: `g${i}`, ...d }));
    const moved = desired
      .filter((d) => !d.key.endsWith("gym|2026-10-03"))
      .map((d) =>
        d.key.endsWith("gym|2026-10-01")
          ? { ...d, start: "18:00", end: "20:00" }
          : d,
      );
    const diff = diffOutbound(moved, existing);
    expect(diff.update.map((u) => u.event.key)).toEqual([
      "2026-09-27|gym|2026-10-01",
    ]);
    expect(diff.remove).toHaveLength(1);
    expect(diff.create).toEqual([]);
  });

  it("ida y vuelta: el cuerpo enviado se reconoce al leerlo de nuevo", () => {
    const d = desired[0];
    const body = toGoogleBody(d, plan.weekStart, TZ);
    const back = toExisting(
      {
        id: "x",
        summary: body.summary,
        description: body.description,
        start: { dateTime: `${body.start.dateTime}-05:00` },
        end: { dateTime: `${body.end.dateTime}-05:00` },
        extendedProperties: body.extendedProperties,
      },
      TZ,
    );
    expect(diffOutbound([d], back ? [back] : [])).toEqual({
      create: [],
      update: [],
      remove: [],
    });
  });
});
