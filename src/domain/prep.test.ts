import { describe, expect, it } from "vitest";
import { catalog } from "../test/fixtures";
import { type PrepStep, planPrep } from "./prep";

const comps = (...ids: string[]) =>
  ids.map((id) => {
    const c = catalog.components.get(id);
    if (!c) throw new Error(id);
    return c;
  });

const overlap = (a: PrepStep, b: PrepStep, endOf: (s: PrepStep) => number) =>
  a.start < endOf(b) && b.start < endOf(a);

describe("planPrep — domingo (pollo + arroz + verduras)", () => {
  const portions = { arroz: 5.6, pollo: 5.6, verduras: 4.6 };
  const plan = planPrep(comps("arroz", "pollo", "verduras"), portions, 5);

  it("cocina el pollo en tandas según el wok (1.5 porciones por tanda)", () => {
    expect(plan.batches.pollo).toBe(4);
    expect(
      plan.steps.filter((s) => s.id.startsWith("pollo:saltear#")),
    ).toHaveLength(4);
  });

  it("nunca usa el wok para dos cosas a la vez", () => {
    const wok = plan.steps.filter((s) => s.equipment === "wok");
    for (const a of wok)
      for (const b of wok)
        if (a !== b) expect(overlap(a, b, (s) => s.end)).toBe(false);
  });

  it("quien cocina hace una sola tarea activa a la vez", () => {
    for (const a of plan.steps)
      for (const b of plan.steps)
        if (a !== b) expect(overlap(a, b, (s) => s.activeEnd)).toBe(false);
  });

  it("la arrocera corre en paralelo con el wok", () => {
    const rice = plan.steps.find((s) => s.id === "arroz:cocinar");
    const wokDuringRice = plan.steps.some(
      (s) =>
        rice &&
        s.equipment === "wok" &&
        s.start >= rice.activeEnd &&
        s.start < rice.end,
    );
    expect(wokDuringRice).toBe(true);
  });

  it("respeta dependencias y termina armando los táperes", () => {
    const at = (id: string) => plan.steps.find((s) => s.id === id);
    expect(at("pollo:condimentar")?.start).toBeGreaterThanOrEqual(
      at("pollo:cortar")?.end ?? Infinity,
    );
    expect(at("pollo:terminar")?.start).toBeGreaterThanOrEqual(
      at("pollo:saltear#4")?.end ?? Infinity,
    );
    const last = plan.steps[plan.steps.length - 1];
    expect(last.id).toBe("armado");
    expect(last.end).toBe(plan.totalMin);
  });

  it("dura entre 1 h 15 y 2 h 30 (objetivo del contexto)", () => {
    expect(plan.totalMin).toBeGreaterThanOrEqual(75);
    expect(plan.totalMin).toBeLessThanOrEqual(150);
  });
});

describe("planPrep — tandas emparejadas", () => {
  it("escurrir la tanda 2 de pasta espera a hervir la tanda 2", () => {
    const plan = planPrep(comps("pasta"), { pasta: 4 }, 4);
    const at = (id: string) => plan.steps.find((s) => s.id === id);
    expect(at("pasta:escurrir#2")?.start).toBeGreaterThanOrEqual(
      at("pasta:hervir#2")?.end ?? Infinity,
    );
  });

  it("sin porciones, plan vacío", () => {
    expect(planPrep(comps("pasta"), {}, 0)).toEqual({
      steps: [],
      totalMin: 0,
      batches: {},
    });
  });
});
