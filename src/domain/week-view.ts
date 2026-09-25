import type { Catalog } from "./catalog";
import {
  addDays,
  diffDays,
  type HHmm,
  type ISODate,
  toMinutes,
  WEEKDAY_LONG,
  weekdayOf,
} from "./dates";
import {
  add,
  assemblyNutrition,
  type Nutrition,
  round,
  ZERO,
} from "./nutrition";
import { campusSpan, eventsOn } from "./schedule";
import type {
  DayTask,
  FoodIcon,
  MealSlot,
  PortionSize,
  PortionState,
  ScheduleEvent,
  Settings,
  WeekPlan,
} from "./types";

export type DayMode = "campus" | "virtual" | "libre";

export interface MealView {
  slot: MealSlot;
  name: string | null;
  icon: FoodIcon | null;
  where: "casa" | "u";
  size: PortionSize;
  /** Estado y táper si viene de un meal prep. */
  portion?: { id: string; state: PortionState; containerNo?: number };
  nutrition?: Nutrition;
}

export interface DayView {
  date: ISODate;
  dayName: string;
  isToday: boolean;
  isPast: boolean;
  mode: DayMode;
  campus: { from: HHmm; to: HHmm } | null;
  courses: ScheduleEvent[];
  /** Compromisos flexibles (Google o agregados en la app) que bloquean horario. */
  commitments: ScheduleEvent[];
  agenda: DayTask[];
  meals: MealView[];
  total: Nutrition;
}

export interface WeekSummary {
  prepMinutes: number;
  preps: number;
  gyms: number;
  lunchesAtU: number;
  frozen: number;
  containers: number;
}

export function buildDayViews(
  plan: WeekPlan,
  events: ScheduleEvent[],
  catalog: Catalog,
  settings: Settings,
  today: ISODate,
): DayView[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(plan.weekStart, i);
    const courses = eventsOn(events, date).filter((e) => e.kind === "fixed");
    const commitments = eventsOn(events, date).filter(
      (e) => e.kind === "flexible",
    );
    const campus = campusSpan(events, date);
    const meals = plan.meals
      .filter((m) => m.date === date)
      .map((m): MealView => {
        const assembly = m.assemblyId
          ? catalog.assemblies.get(m.assemblyId)
          : undefined;
        const portion = plan.portions.find((p) => p.id === m.portionId);
        return {
          slot: m.slot,
          name: assembly?.name ?? null,
          icon: assembly?.icon ?? null,
          where: m.where,
          size: m.size,
          portion: portion && {
            id: portion.id,
            state: portion.state,
            containerNo: portion.containerNo,
          },
          nutrition:
            assembly &&
            round(
              assemblyNutrition(
                assembly,
                catalog.components,
                catalog.ingredients,
                m.size,
                settings.portion.factor,
              ),
            ),
        };
      });
    return {
      date,
      dayName: WEEKDAY_LONG[weekdayOf(date)],
      isToday: date === today,
      isPast: diffDays(today, date) < 0,
      mode: campus ? "campus" : courses.length > 0 ? "virtual" : "libre",
      campus,
      courses,
      commitments,
      agenda: plan.tasks.filter((t) => t.date === date),
      meals,
      total: meals.reduce(
        (acc, m) => (m.nutrition ? add(acc, m.nutrition) : acc),
        ZERO,
      ),
    };
  });
}

export function summarizeWeek(plan: WeekPlan): WeekSummary {
  const preps = plan.sessions.filter((s) => s.kind === "prep");
  const minutes = (s: { start: HHmm; end: HHmm }) =>
    toMinutes(s.end) - toMinutes(s.start);
  return {
    prepMinutes: preps.reduce((acc, s) => acc + minutes(s), 0),
    preps: preps.length,
    gyms: plan.sessions.filter((s) => s.kind === "gym").length,
    lunchesAtU: plan.meals.filter((m) => m.where === "u").length,
    frozen: plan.portions.filter((p) => p.state === "frozen").length,
    containers: new Set(
      plan.portions.map((p) => p.containerNo).filter((n) => n !== undefined),
    ).size,
  };
}
