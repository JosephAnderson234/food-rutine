import { describe, expect, it } from "vitest";
import { catalog, seedWeek } from "../test/fixtures";
import { buildCook, liveStatus, prepSessions, timerViews } from "./cook";

const plan = seedWeek();
const dom = buildCook(plan, catalog, "prep-dom");
const mie = buildCook(plan, catalog, "prep-mie");

describe("buildCook", () => {
  it("lista las dos sesiones de la semana", () => {
    expect(prepSessions(plan).map((s) => s.refId)).toEqual([
      "prep-dom",
      "prep-mie",
    ]);
  });

  it("los pasos llevan hora de reloj desde el inicio (16:00)", () => {
    expect(dom.steps[0].at).toBe("16:00");
    expect(dom.steps.at(-1)?.id).toBe("armado");
  });

  it("marca la temperatura segura en los pasos de carne en el wok", () => {
    const saltear = dom.steps.find((s) => s.id.startsWith("pollo:saltear"));
    const cortar = dom.steps.find((s) => s.id === "pollo:cortar");
    expect(saltear?.safeTempC).toBe(74);
    expect(cortar?.safeTempC).toBeUndefined();
    expect(
      mie.steps.find((s) => s.id.startsWith("carne:dorar"))?.safeTempC,
    ).toBe(71);
  });

  it("domingo: 5 táperes, el del miércoles al congelador", () => {
    expect(dom.containers.map((c) => [c.containerNo, c.storage])).toEqual([
      [1, "refri"],
      [2, "refri"],
      [3, "refri"],
      [4, "refri"],
      [5, "congelador"],
    ]);
    expect(dom.containers[0].tag).toBe("Lun almuerzo · Pollo · hecho 27/09");
  });

  it("miércoles: la cena de esa noche se sirve directo, sin táper", () => {
    const served = mie.containers.filter((c) => c.storage === "servir");
    expect(served).toHaveLength(1);
    expect(served[0].containerNo).toBeNull();
    expect(mie.before[0]).toContain("5 táperes grandes y 1 pequeño para salsa");
  });

  it("refrigerar dentro de 2 h desde que termina", () => {
    expect(dom.coolBy).toBe("19:38");
  });
});

describe("liveStatus", () => {
  it("al empezar: lo primero es cortar el pollo", () => {
    const s = liveStatus(dom, 0, new Set());
    expect(s.now[0].id).toBe("pollo:cortar");
    expect(s.behindMin).toBe(0);
  });

  it("con el arroz encendido, la arrocera aparece corriendo sola", () => {
    const rice = dom.steps.find((s) => s.id === "arroz:cocinar");
    if (!rice) throw new Error("falta arroz:cocinar");
    const done = new Set(
      dom.steps.filter((s) => s.start <= rice.start).map((s) => s.id),
    );
    const s = liveStatus(dom, rice.activeEnd + 5, done);
    expect(s.running.map((r) => r.step.id)).toContain("arroz:cocinar");
    expect(s.running[0].remainingMin).toBe(rice.end - rice.activeEnd - 5);
  });

  it("si vas atrasado lo dice y mantiene lo pendiente primero", () => {
    const s = liveStatus(dom, 30, new Set());
    expect(s.now[0].id).toBe("pollo:cortar");
    expect(s.behindMin).toBeGreaterThan(0);
  });

  it("todo marcado = terminado", () => {
    expect(
      liveStatus(dom, 200, new Set(dom.steps.map((s) => s.id))).finished,
    ).toBe(true);
  });
});

describe("detalle de pasos", () => {
  it("cada tanda de pollo trae su cantidad, fuego y señal de listo", () => {
    const t1 = dom.steps.find((s) => s.id === "pollo:saltear#1");
    // 5.6 porciones × 200 g ÷ 4 tandas = 280 g
    expect(t1?.amounts.find((a) => a.ingredientId === "pollo")?.display).toBe(
      "280 g",
    );
    expect(t1?.amounts.find((a) => a.ingredientId === "aceite")?.display).toBe(
      "1½ cdta",
    );
    expect(t1?.heat).toBe("medio-alto");
    expect(t1?.cue).toContain("74 °C");
    expect(t1?.details.length).toBeGreaterThan(3);
  });

  it("condimentos en medidas de cocina, no gramos", () => {
    const c = dom.steps.find((s) => s.id === "pollo:condimentar");
    expect(c?.amounts.map((a) => a.display)).toEqual([
      "1 cdta",
      "1 cdta",
      "2¼ cdta",
      "1 cdta",
    ]);
  });

  it("el armado detalla cada táper y la hora límite", () => {
    const a = dom.steps.find((s) => s.id === "armado");
    expect(a?.details[0]).toBe(
      "Táper #1: Pollo + arroz + verduras (porción grande) → refri.",
    );
    expect(
      a?.details.some((d) => d.includes("#5") && d.includes("congelador")),
    ).toBe(true);
    expect(a?.cue).toContain("19:38");
  });
});

describe("timerViews", () => {
  it("cuenta regresiva y aviso al terminar", () => {
    const t0 = Date.UTC(2026, 8, 27, 21, 0);
    const views = timerViews(
      [
        { stepId: "arroz:cocinar", startedAt: t0, minutes: 35 },
        { stepId: "pollo:saltear#1", startedAt: t0, minutes: 8 },
      ],
      dom.steps,
      t0 + 10 * 60_000,
    );
    expect(views.map((v) => [v.label, v.remainingSec, v.done])).toEqual([
      ["Pollo salteado", 0, true],
      ["Arrocera", 25 * 60, false],
    ]);
  });
});
