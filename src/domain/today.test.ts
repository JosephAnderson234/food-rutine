import { DEFAULT_SETTINGS, FIXED_COURSES } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import { catalog, seedWeek, WEEK } from "../test/fixtures";
import { addDays } from "./dates";
import { applyAction } from "./safety";
import { expandFixedCourses } from "./schedule";
import { buildToday, isTaskDone, portionActions, taskCheckKey } from "./today";
import type { WeekPlan } from "./types";

const events = expandFixedCourses(FIXED_COURSES, WEEK);
const base = seedWeek();

const today = (date: string, nowMin: number, plan: WeekPlan = base) =>
  buildToday({
    plan,
    events,
    catalog,
    settings: DEFAULT_SETTINGS,
    today: date,
    nowMin,
  });

const withState = (
  plan: WeekPlan,
  eatOn: string,
  slot: string,
  action: Parameters<typeof applyAction>[1],
): WeekPlan => ({
  ...plan,
  portions: plan.portions.map((p) =>
    p.eatOn === eatOn && p.slot === slot ? applyAction(p, action) : p,
  ),
});

describe("buildToday", () => {
  it("lunes 7:00: lo siguiente es armar la lonchera a las 8:15", () => {
    const t = today("2026-09-28", 7 * 60);
    expect(t.next?.task.kind).toBe("pack");
    expect(t.next?.inMin).toBe(75);
    expect(t.packing?.items[0].label).toContain("taper #1");
  });

  it("lunes: el almuerzo se puede empacar y comer; la cena solo comer", () => {
    const t = today("2026-09-28", 7 * 60);
    const lunch = t.meals.find((m) => m.slot === "almuerzo");
    const dinner = t.meals.find((m) => m.slot === "cena");
    expect(lunch?.actions).toEqual(["pack", "eat", "discard"]);
    expect(dinner?.actions).toEqual(["eat", "discard"]);
  });

  it("martes por la noche avisa pasar al refri la porción del miércoles", () => {
    const t = today("2026-09-29", 20 * 60);
    expect(t.next?.task.kind).toBe("thaw");
    expect(
      t.alerts.some((a) => a.level === "info" && a.message.includes("Mié")),
    ).toBe(true);
  });

  it("jueves: sin mochila; mañana viernes sí va a la U", () => {
    const t = today("2026-10-01", 9 * 60);
    expect(t.packing).toBeNull();
    expect(t.tomorrow?.lunch?.where).toBe("u");
    expect(t.tomorrow?.lunch?.portion?.containerNo).toBe(3);
  });

  it("comidas pasadas sin marcar quedan pendientes", () => {
    const t = today("2026-09-29", 9 * 60);
    expect(t.pending.map((p) => [p.eatOn, p.slot])).toEqual([
      ["2026-09-28", "almuerzo"],
      ["2026-09-28", "cena"],
    ]);
    const marked = withState(
      withState(base, "2026-09-28", "almuerzo", "eat"),
      "2026-09-28",
      "cena",
      "eat",
    );
    expect(today("2026-09-29", 9 * 60, marked).pending).toEqual([]);
  });

  it("lo empacado y no comido del día anterior es peligro", () => {
    const packed = withState(base, "2026-09-28", "almuerzo", "pack");
    const t = today("2026-09-29", 9 * 60, packed);
    expect(t.alerts[0].level).toBe("danger");
  });

  it("sábado: 'mañana' sale del plan de la semana siguiente", () => {
    const nextWeek = addDays(WEEK, 7);
    const t = buildToday({
      plan: base,
      events,
      catalog,
      settings: DEFAULT_SETTINGS,
      today: "2026-10-03",
      nowMin: 9 * 60,
      nextPlan: seedWeek([], DEFAULT_SETTINGS, nextWeek),
      nextEvents: expandFixedCourses(FIXED_COURSES, nextWeek),
    });
    expect(t.tomorrow?.day.date).toBe("2026-10-04");
    expect(t.tomorrow?.day.agenda.some((a) => a.kind === "prep")).toBe(true);
  });

  it("falla si hoy no es de esa semana", () => {
    expect(() => today("2026-10-05", 0)).toThrow();
  });
});

describe("portionActions", () => {
  it("congelada: descongelar o descartar", () => {
    expect(
      portionActions({
        slot: "almuerzo",
        name: "x",
        icon: null,
        where: "u",
        size: "normal",
        portion: { id: "p", state: "frozen" },
      }),
    ).toEqual(["thaw", "discard"]);
  });

  it("sin porción (desayuno), sin acciones", () => {
    expect(
      portionActions({
        slot: "desayuno",
        name: "Avena",
        icon: "oats",
        where: "casa",
        size: "normal",
      }),
    ).toEqual([]);
  });
});

describe("tareas ↔ porciones", () => {
  const thaw = base.tasks.find((t) => t.kind === "thaw");
  const gel = base.tasks.find((t) => t.kind === "finish");
  if (!thaw || !gel) throw new Error("faltan tareas en el plan");
  const portion = base.portions.find((p) => p.id === thaw.portionId);

  it("descongelar se completa cuando la porción deja de estar congelada", () => {
    expect(isTaskDone(thaw, portion, new Set())).toBe(false);
    expect(
      isTaskDone(thaw, portion && applyAction(portion, "thaw"), new Set()),
    ).toBe(true);
  });

  it("las demás tareas usan casillas", () => {
    expect(isTaskDone(gel, undefined, new Set())).toBe(false);
    expect(isTaskDone(gel, undefined, new Set([taskCheckKey(gel)]))).toBe(true);
  });
});
