import { describe, expect, it } from "vitest";
import { seedWeek } from "../test/fixtures";
import { carryOver } from "./replan";
import { applyAction } from "./safety";
import type { Portion } from "./types";

const base = seedWeek();
const find = (ps: Portion[], eatOn: string, slot: string) => {
  const p = ps.find((x) => x.eatOn === eatOn && x.slot === slot);
  if (!p) throw new Error(`${eatOn} ${slot}`);
  return p;
};
const act = (
  ps: Portion[],
  eatOn: string,
  slot: string,
  action: Parameters<typeof applyAction>[1],
) =>
  ps.map((p) =>
    p.eatOn === eatOn && p.slot === slot ? applyAction(p, action) : p,
  );

describe("carryOver", () => {
  it("conserva lo que ya hiciste con porciones cocinadas", () => {
    let prev = act(base.portions, "2026-09-28", "almuerzo", "pack");
    prev = act(prev, "2026-09-28", "almuerzo", "eat");
    prev = act(prev, "2026-09-30", "almuerzo", "thaw");
    const { portions } = carryOver(base.portions, prev, "2026-09-29");
    expect(find(portions, "2026-09-28", "almuerzo").state).toBe("eaten");
    expect(find(portions, "2026-09-30", "almuerzo").state).toBe("thawing");
  });

  it("lo cocinado mantiene su táper aunque el plan nuevo reparta distinto", () => {
    const prev = base.portions.map((p) =>
      p.eatOn === "2026-09-29" && p.slot === "cena"
        ? { ...p, containerNo: 6 }
        : p,
    );
    const { portions } = carryOver(base.portions, prev, "2026-09-28");
    expect(find(portions, "2026-09-29", "cena").containerNo).toBe(6);
  });

  it("lo que aún no se cocina toma el plan nuevo", () => {
    const next = base.portions.map((p) =>
      p.prepId === "prep-mie" ? { ...p, size: "grande" as const } : p,
    );
    const { portions } = carryOver(next, base.portions, "2026-09-28");
    expect(find(portions, "2026-10-02", "cena").size).toBe("grande");
  });

  it("avisa si algo cocinado quedó en la refri y el plan nuevo lo congelaría", () => {
    const prev = base.portions.map((p) =>
      p.eatOn === "2026-09-30" && p.slot === "almuerzo"
        ? { ...p, state: "fridge" as const }
        : p,
    );
    const { notes } = carryOver(base.portions, prev, "2026-09-28");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("Mié almuerzo");
  });

  it("no pierde porciones cocinadas que el plan nuevo ya no usa", () => {
    const next = base.portions.filter(
      (p) => !(p.eatOn === "2026-09-29" && p.slot === "cena"),
    );
    const { portions, notes } = carryOver(next, base.portions, "2026-09-28");
    expect(portions).toHaveLength(base.portions.length);
    expect(notes[0]).toContain("no la usa");
  });
});
