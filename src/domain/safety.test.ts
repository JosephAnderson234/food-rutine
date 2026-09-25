import { describe, expect, it } from "vitest";
import { applyAction, coolDeadline, portionAlerts, storageFor } from "./safety";
import type { Portion } from "./types";

const safety = { fridgeMaxDays: 3, freezeAfterDays: 2, thawAt: "21:00" };

const portion = (over: Partial<Portion> = {}): Portion => ({
  id: "p",
  weekStart: "2026-09-27",
  prepId: "prep-dom",
  assemblyId: "bowl-pollo",
  componentIds: ["arroz", "pollo"],
  cookedOn: "2026-09-27",
  eatOn: "2026-09-29",
  slot: "almuerzo",
  size: "normal",
  state: "fridge",
  label: "Pollo — Mar",
  ...over,
});

describe("storageFor", () => {
  it("refri hasta freezeAfterDays", () => {
    expect(storageFor("2026-09-27", "2026-09-27", safety)).toEqual({
      state: "fridge",
    });
    expect(storageFor("2026-09-27", "2026-09-29", safety)).toEqual({
      state: "fridge",
    });
  });

  it("congela después, con descongelado la noche anterior", () => {
    expect(storageFor("2026-09-27", "2026-09-30", safety)).toEqual({
      state: "frozen",
      thawOn: "2026-09-29",
      forced: false,
    });
  });

  it("obligatorio pasado el límite duro", () => {
    expect(storageFor("2026-09-27", "2026-10-01", safety)).toMatchObject({
      state: "frozen",
      forced: true,
    });
  });

  it("rechaza comer antes de cocinar", () => {
    expect(() => storageFor("2026-09-30", "2026-09-29", safety)).toThrow();
  });
});

describe("ciclo de vida", () => {
  it("congelada → descongelando → empacada → comida", () => {
    let p = portion({ state: "frozen" });
    p = applyAction(p, "thaw");
    p = applyAction(p, "pack");
    p = applyAction(p, "eat");
    expect(p.state).toBe("eaten");
  });

  it("una porción empacada no vuelve a la refri ni al congelador", () => {
    const packed = portion({ state: "packed" });
    expect(() => applyAction(packed, "freeze")).toThrow();
    expect(() => applyAction(packed, "thaw")).toThrow();
  });

  it("no se empaca directo del congelador", () => {
    expect(() => applyAction(portion({ state: "frozen" }), "pack")).toThrow();
  });
});

describe("portionAlerts", () => {
  it("avisa descongelar la víspera", () => {
    const alerts = portionAlerts(
      portion({ state: "frozen", eatOn: "2026-09-30" }),
      "2026-09-29",
      safety,
    );
    expect(alerts).toEqual([expect.objectContaining({ level: "info" })]);
  });

  it("peligro si pasó el límite en refri", () => {
    const alerts = portionAlerts(
      portion({ eatOn: "2026-10-01" }),
      "2026-10-01",
      safety,
    );
    expect(alerts[0].level).toBe("danger");
  });

  it("peligro si lo empacado no se comió ese día", () => {
    const alerts = portionAlerts(
      portion({ state: "packed", eatOn: "2026-09-29" }),
      "2026-09-30",
      safety,
    );
    expect(alerts[0].level).toBe("danger");
  });
});

describe("coolDeadline", () => {
  it("2 h normalmente, 1 h con calor", () => {
    expect(coolDeadline("17:38")).toBe("19:38");
    expect(coolDeadline("17:38", 34)).toBe("18:38");
  });
});
