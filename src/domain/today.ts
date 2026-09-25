import type { Catalog } from "./catalog";
import { addDays, diffDays, type ISODate, toMinutes } from "./dates";
import { type PackingList, packingFor } from "./packing";
import {
  canApply,
  type PortionAction,
  type PortionAlert,
  portionAlerts,
} from "./safety";
import type {
  DayTask,
  Portion,
  ScheduleEvent,
  Settings,
  WeekPlan,
} from "./types";
import { buildDayViews, type DayView, type MealView } from "./week-view";

export interface MealWithActions extends MealView {
  actions: PortionAction[];
}

/** Acciones que tienen sentido para una comida según su porción y dónde se come. */
export function portionActions(meal: MealView): PortionAction[] {
  const p = meal.portion;
  if (!p) return [];
  const actions: PortionAction[] = [];
  if (canApply(p.state, "thaw")) actions.push("thaw");
  if (meal.where === "u" && canApply(p.state, "pack")) actions.push("pack");
  if (canApply(p.state, "eat")) actions.push("eat");
  if (canApply(p.state, "discard")) actions.push("discard");
  return actions;
}

export interface TodayInput {
  plan: WeekPlan;
  events: ScheduleEvent[];
  catalog: Catalog;
  settings: Settings;
  today: ISODate;
  /** Minutos desde medianoche (hora local). */
  nowMin: number;
  /** Plan de la semana siguiente, para "mañana" cuando hoy es sábado. */
  nextPlan?: WeekPlan;
  nextEvents?: ScheduleEvent[];
}

export interface TodayView {
  day: DayView;
  meals: MealWithActions[];
  packing: PackingList | null;
  next: { task: DayTask; inMin: number } | null;
  alerts: PortionAlert[];
  /** Comidas de días anteriores que siguen sin marcarse. */
  pending: Portion[];
  tomorrow: { day: DayView; lunch: MealView | null } | null;
}

const LEVEL_ORDER = { danger: 0, warn: 1, info: 2 } as const;

function inWeek(plan: WeekPlan, date: ISODate): boolean {
  const d = diffDays(plan.weekStart, date);
  return d >= 0 && d <= 6;
}

export function buildToday(input: TodayInput): TodayView {
  const { plan, events, catalog, settings, today, nowMin } = input;
  const day = buildDayViews(plan, events, catalog, settings, today).find(
    (d) => d.date === today,
  );
  if (!day)
    throw new Error(`${today} no pertenece a la semana ${plan.weekStart}`);

  const upcoming = day.agenda
    .filter((t) => t.time !== undefined && toMinutes(t.time) >= nowMin)
    .sort((a, b) => toMinutes(a.time ?? "0:0") - toMinutes(b.time ?? "0:0"));
  const nextTask = upcoming[0];

  const alerts = plan.portions
    .flatMap((p) => portionAlerts(p, today, settings.safety))
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  const pending = plan.portions.filter(
    (p) =>
      diffDays(p.eatOn, today) > 0 &&
      (p.state === "fridge" || p.state === "thawing" || p.state === "packed"),
  );

  const tomorrowDate = addDays(today, 1);
  const tPlan = inWeek(plan, tomorrowDate) ? plan : input.nextPlan;
  const tEvents = inWeek(plan, tomorrowDate) ? events : input.nextEvents;
  const tDay =
    tPlan && tEvents
      ? buildDayViews(tPlan, tEvents, catalog, settings, today).find(
          (d) => d.date === tomorrowDate,
        )
      : undefined;

  return {
    day,
    meals: day.meals.map((m) => ({ ...m, actions: portionActions(m) })),
    packing: packingFor(plan, today, catalog),
    next: nextTask?.time
      ? { task: nextTask, inMin: toMinutes(nextTask.time) - nowMin }
      : null,
    alerts,
    pending,
    tomorrow: tDay
      ? {
          day: tDay,
          lunch:
            tDay.meals.find((m) => m.slot === "almuerzo" && m.name) ?? null,
        }
      : null,
  };
}

/**
 * Tareas que equivalen a mover una porción: marcarlas aplica la acción.
 * "freeze" no entra: la porción ya nace planificada como congelada.
 */
export function taskPortionAction(task: DayTask): PortionAction | null {
  if (!task.portionId) return null;
  if (task.kind === "thaw") return "thaw";
  if (task.kind === "pack") return "pack";
  return null;
}

/** Clave de casilla para tareas que no mueven porciones. */
export const taskCheckKey = (task: DayTask) => `task:${task.id}`;

export function isTaskDone(
  task: DayTask,
  portion: Portion | undefined,
  checks: Set<string>,
): boolean {
  const action = taskPortionAction(task);
  if (action && portion) return !canApply(portion.state, action);
  return checks.has(taskCheckKey(task));
}
