import { describe, expect, it } from "vitest";
import { seedWeek } from "../test/fixtures";
import { timerReminders, upcoming, weekReminders } from "./reminders";

const plan = seedWeek();
const reminders = weekReminders(plan, "America/Lima");

describe("weekReminders", () => {
  it("descongelar a las 21:00 de Lima (02:00 UTC del día siguiente)", () => {
    const thaw = reminders.find(
      (r) => r.key.startsWith("thaw|") && r.fireAt.startsWith("2026-09-30"),
    );
    expect(thaw?.fireAt).toBe("2026-09-30T02:00:00.000Z");
    expect(thaw?.url).toBe("/hoy");
  });

  it("meal prep del domingo 16:00 → aviso 15:30 que abre Cocina", () => {
    const prep = reminders.find((r) => r.key === "prep|prep-dom");
    expect(prep?.fireAt).toBe("2026-09-27T20:30:00.000Z");
    expect(prep?.url).toBe("/cocina");
  });

  it("claves únicas (el backend reemplaza por clave sin duplicar)", () => {
    const keys = reminders.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("no avisa el gym", () => {
    expect(reminders.some((r) => r.title.includes("Gym"))).toBe(false);
  });

  it("upcoming descarta lo que ya pasó", () => {
    const now = Date.parse("2026-09-30T00:00:00Z");
    expect(
      upcoming(reminders, now).every((r) => Date.parse(r.fireAt) > now),
    ).toBe(true);
    expect(upcoming(reminders, now).length).toBeLessThan(reminders.length);
  });
});

describe("timerReminders", () => {
  it("avisa al terminar y omite los vencidos", () => {
    const t0 = Date.parse("2026-09-27T21:00:00Z");
    const out = timerReminders(
      [
        {
          prepId: "prep-dom",
          stepId: "arroz:cocinar",
          minutes: 35,
          startedAt: t0,
          label: "Arroz",
        },
        {
          prepId: "prep-dom",
          stepId: "pollo:saltear#1",
          minutes: 8,
          startedAt: t0 - 60 * 60_000,
          label: "Pollo",
        },
      ],
      t0 + 60_000,
    );
    expect(out).toEqual([
      {
        key: `prep-dom|arroz:cocinar|${t0}`,
        title: "Listo: Arroz",
        body: "35 min",
        url: "/cocina",
        fireAt: "2026-09-27T21:35:00.000Z",
      },
    ]);
  });
});
