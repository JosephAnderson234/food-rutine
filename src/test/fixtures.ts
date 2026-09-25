import {
  ASSEMBLIES,
  COMPONENTS,
  DEFAULT_SETTINGS,
  FIXED_COURSES,
  INGREDIENTS,
  WEEK_A,
} from "@app/data/seed";
import { makeCatalog } from "@app/domain/catalog";
import { expandFixedCourses } from "@app/domain/schedule";
import type { ScheduleEvent, Settings } from "@app/domain/types";
import { buildWeek } from "@app/domain/week";

/** Domingo 27 de septiembre de 2026. */
export const WEEK = "2026-09-27";

export const catalog = makeCatalog({
  ingredients: INGREDIENTS,
  components: COMPONENTS,
  assemblies: ASSEMBLIES,
});

export function seedWeek(
  extraEvents: ScheduleEvent[] = [],
  settings: Settings = DEFAULT_SETTINGS,
  weekStart = WEEK,
) {
  return buildWeek({
    weekStart,
    template: WEEK_A,
    catalog,
    settings,
    events: [...expandFixedCourses(FIXED_COURSES, weekStart), ...extraEvents],
  });
}
