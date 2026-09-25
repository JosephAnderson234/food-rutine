import { DEFAULT_SETTINGS, FIXED_COURSES } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import { catalog, seedWeek, WEEK } from "../test/fixtures";
import { expandFixedCourses } from "./schedule";
import { buildDayViews, summarizeWeek } from "./week-view";

const plan = seedWeek();
const events = expandFixedCourses(FIXED_COURSES, WEEK);
const days = buildDayViews(
  plan,
  events,
  catalog,
  DEFAULT_SETTINGS,
  "2026-09-29",
);

describe("buildDayViews", () => {
  it("7 días de domingo a sábado", () => {
    expect(days.map((d) => d.dayName)).toEqual([
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
    ]);
  });

  it("marca hoy y los días pasados", () => {
    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual([
      "2026-09-29",
    ]);
    expect(days.filter((d) => d.isPast).map((d) => d.date)).toEqual([
      "2026-09-27",
      "2026-09-28",
    ]);
  });

  it("clasifica el día: campus, solo virtual o libre", () => {
    expect(days.map((d) => d.mode)).toEqual([
      "libre",
      "campus",
      "campus",
      "campus",
      "virtual",
      "campus",
      "libre",
    ]);
  });

  it("cada comida con plato trae su nutrición y el día suma el total", () => {
    const lunes = days[1];
    const sum = lunes.meals.reduce(
      (acc, m) => acc + (m.nutrition?.kcal ?? 0),
      0,
    );
    expect(lunes.total.kcal).toBeCloseTo(sum, 0);
    expect(
      lunes.meals.find((m) => m.slot === "almuerzo")?.portion?.containerNo,
    ).toBe(1);
  });
});

describe("summarizeWeek", () => {
  it("resume la semana A", () => {
    expect(summarizeWeek(plan)).toMatchObject({
      preps: 2,
      gyms: 3,
      lunchesAtU: 4,
      frozen: 2,
      containers: 5,
    });
  });
});
