import { DEFAULT_SETTINGS } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import { catalog, seedWeek } from "../test/fixtures";
import { packingFor } from "./packing";
import type { ScheduleEvent } from "./types";
import { templateIdForWeek } from "./week";

describe("buildWeek — Semana A con el horario real", () => {
  const plan = seedWeek();
  const byDate = (date: string, kind: string) =>
    plan.tasks.filter((t) => t.date === date && t.kind === kind);

  it("no genera advertencias", () => {
    expect(plan.warnings).toEqual([]);
  });

  it("gym lunes 17:00, jueves 15:00, sábado 10:00", () => {
    expect(
      plan.sessions
        .filter((s) => s.kind === "gym")
        .map((s) => [s.date, s.start]),
    ).toEqual([
      ["2026-09-28", "17:00"],
      ["2026-10-01", "15:00"],
      ["2026-10-03", "10:00"],
    ]);
  });

  it("meal prep domingo 16:00 y miércoles 19:30", () => {
    expect(
      plan.sessions
        .filter((s) => s.kind === "prep")
        .map((s) => [s.date, s.start]),
    ).toEqual([
      ["2026-09-27", "16:00"],
      ["2026-09-30", "19:30"],
    ]);
  });

  it("congela lo que se come al 3er día y agenda el descongelado la víspera a las 21:00", () => {
    const frozen = plan.portions
      .filter((p) => p.state === "frozen")
      .map((p) => p.eatOn);
    expect(frozen).toEqual(["2026-09-30", "2026-10-03"]);
    expect(byDate("2026-09-29", "thaw")).toHaveLength(1);
    expect(byDate("2026-09-29", "thaw")[0].time).toBe("21:00");
    expect(byDate("2026-10-02", "thaw")).toHaveLength(1);
  });

  it("almuerzo en la U solo los días con clases presenciales al mediodía", () => {
    const atU = plan.meals.filter((m) => m.where === "u").map((m) => m.date);
    expect(atU).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-02",
    ]);
  });

  it("porciones grandes en días de gym", () => {
    const sizes = plan.portions.map((p) => [p.eatOn, p.slot, p.size]);
    expect(sizes).toContainEqual(["2026-09-28", "almuerzo", "grande"]);
    expect(sizes).toContainEqual(["2026-09-29", "almuerzo", "normal"]);
  });

  it("nunca hay dos porciones vivas en el mismo táper y alcanzan 6", () => {
    const withBox = plan.portions.filter((p) => p.containerNo !== undefined);
    for (const a of withBox) {
      expect(a.containerNo).toBeLessThanOrEqual(
        DEFAULT_SETTINGS.containers.large,
      );
      for (const b of withBox) {
        if (a === b || a.containerNo !== b.containerNo) continue;
        const aLive = [a.cookedOn, a.eatOn];
        const bLive = [b.cookedOn, b.eatOn];
        expect(aLive[0] < bLive[1] && bLive[0] < aLive[1]).toBe(false);
      }
    }
  });

  it("la cena del miércoles se come recién hecha, sin táper", () => {
    const wedDinner = plan.portions.find(
      (p) => p.eatOn === "2026-09-30" && p.slot === "cena",
    );
    expect(wedDinner?.containerNo).toBeUndefined();
  });

  it("recuerda congelar gel packs la noche antes de cada día en la U", () => {
    expect(
      plan.tasks.filter((t) => t.kind === "gelpacks").map((t) => t.date),
    ).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-10-01"]);
  });

  it("la tarea de gel packs explica por qué", () => {
    expect(byDate("2026-10-01", "gelpacks")[0].label).toBe(
      "Gel packs al congelador: mañana almuerzas en la U (taper #3)",
    );
  });

  it("chaufa del martes es un acabado en casa", () => {
    expect(byDate("2026-09-29", "finish")[0].label).toContain("Chaufa");
  });
});

describe("buildWeek — semana rota", () => {
  it("si el jueves 15–17 hay un trabajo, mueve el gym y avisa", () => {
    const trabajo: ScheduleEvent = {
      id: "t",
      title: "Trabajo grupal",
      date: "2026-10-01",
      start: "14:00",
      end: "18:00",
      kind: "flexible",
      source: "google",
    };
    const plan = seedWeek([trabajo]);
    const gymJue = plan.sessions.find(
      (s) => s.kind === "gym" && s.date === "2026-10-01",
    );
    expect(gymJue?.start).toBe("18:00");
    expect(plan.warnings.some((w) => w.includes("Jueves"))).toBe(true);
  });

  it("con pocos táperes avisa que faltan", () => {
    const plan = seedWeek([], {
      ...DEFAULT_SETTINGS,
      containers: { large: 3, small: 4 },
    });
    expect(plan.warnings.some((w) => w.startsWith("Faltan táperes"))).toBe(
      true,
    );
  });
});

describe("packingFor", () => {
  const plan = seedWeek();

  it("lunes: táper #1, sillao, lonchera y 2 gel packs", () => {
    const list = packingFor(plan, "2026-09-28", catalog);
    const ids = list?.items.map((i) => i.id);
    expect(list?.items[0].label).toContain("taper #1");
    expect(ids).toEqual(
      expect.arrayContaining([
        "sillao",
        "lonchera",
        "gel1",
        "gel2",
        "cubiertos",
      ]),
    );
  });

  it("viernes: la pasta lleva su salsa aparte", () => {
    expect(
      packingFor(plan, "2026-10-02", catalog)?.items.map((i) => i.id),
    ).toContain("salsa");
  });

  it("jueves: se come en casa, no hay mochila", () => {
    expect(packingFor(plan, "2026-10-01", catalog)).toBeNull();
  });
});

describe("rotación", () => {
  it("alterna plantillas semana a semana", () => {
    const r = ["A", "B"];
    expect(templateIdForWeek("2026-09-27", r)).not.toBe(
      templateIdForWeek("2026-10-04", r),
    );
    expect(templateIdForWeek("2026-09-27", r)).toBe(
      templateIdForWeek("2026-10-11", r),
    );
  });
});
