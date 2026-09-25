import { type Catalog, makeCatalog } from "@app/domain/catalog";
import type { TimerState } from "@app/domain/cook";
import { type ISODate, todayIn } from "@app/domain/dates";
import { carryOver } from "@app/domain/replan";
import { applyAction, type PortionAction } from "@app/domain/safety";
import { expandFixedCourses } from "@app/domain/schedule";
import type {
  Portion,
  ScheduleEvent,
  Settings,
  WeekPlan,
  WeekTemplate,
} from "@app/domain/types";
import { buildWeek, templateIdForWeek } from "@app/domain/week";
import type { MealPrepDB } from "./db";
import {
  ASSEMBLIES,
  COMPONENTS,
  DEFAULT_SETTINGS,
  FIXED_COURSES,
  INGREDIENTS,
  WEEK_TEMPLATES,
} from "./seed";

/** Carga los datos iniciales solo si la base está vacía (no pisa ediciones del usuario). */
export async function seedIfEmpty(db: MealPrepDB): Promise<boolean> {
  return db.transaction(
    "rw",
    [
      db.ingredients,
      db.components,
      db.assemblies,
      db.weekTemplates,
      db.fixedCourses,
      db.settings,
    ],
    async () => {
      if ((await db.settings.count()) > 0) return false;
      await db.ingredients.bulkPut(INGREDIENTS);
      await db.components.bulkPut(COMPONENTS);
      await db.assemblies.bulkPut(ASSEMBLIES);
      await db.weekTemplates.bulkPut(WEEK_TEMPLATES);
      await db.fixedCourses.bulkPut(FIXED_COURSES);
      await db.settings.put(DEFAULT_SETTINGS);
      return true;
    },
  );
}

export interface LoadedData {
  catalog: Catalog;
  templates: Map<string, WeekTemplate>;
  settings: Settings;
}

export async function loadData(db: MealPrepDB): Promise<LoadedData> {
  const [ingredients, components, assemblies, templates, settings] =
    await Promise.all([
      db.ingredients.toArray(),
      db.components.toArray(),
      db.assemblies.toArray(),
      db.weekTemplates.toArray(),
      db.settings.get("default"),
    ]);
  if (!settings)
    throw new Error("Base sin configuración: llama a seedIfEmpty primero");
  return {
    catalog: makeCatalog({ ingredients, components, assemblies }),
    templates: new Map(templates.map((t) => [t.id, t])),
    settings,
  };
}

/**
 * Eventos de la semana: los de Google Calendar si ya se sincronizó esa semana;
 * si no, los cursos guardados localmente (funciona sin conexión).
 */
export async function weekEvents(
  db: MealPrepDB,
  weekStart: ISODate,
): Promise<ScheduleEvent[]> {
  const cached = await db.calendarCache.get(weekStart);
  const base = cached
    ? cached.events
    : expandFixedCourses(await db.fixedCourses.toArray(), weekStart);
  const manual = await manualEventsFor(db, weekStart);
  return [...base, ...manual];
}

export async function manualEventsFor(
  db: MealPrepDB,
  weekStart: ISODate,
): Promise<ScheduleEvent[]> {
  const rows = await db.manualEvents
    .where("weekStart")
    .equals(weekStart)
    .toArray();
  return rows.map(({ weekStart: _, ...e }) => e);
}

/** Agrega compromisos a la semana y la recalcula (conserva lo ya cocinado). */
export async function addManualEvents(
  db: MealPrepDB,
  weekStart: ISODate,
  events: ScheduleEvent[],
): Promise<WeekPlan> {
  await db.manualEvents.bulkPut(events.map((e) => ({ ...e, weekStart })));
  return regenerateWeek(db, weekStart);
}

export async function removeManualEvent(
  db: MealPrepDB,
  weekStart: ISODate,
  id: string,
): Promise<WeekPlan> {
  await db.manualEvents.delete(id);
  return regenerateWeek(db, weekStart);
}

export async function saveCalendarCache(
  db: MealPrepDB,
  weekStart: ISODate,
  events: ScheduleEvent[],
): Promise<void> {
  await db.calendarCache.put({
    weekStart,
    events,
    fetchedAt: new Date().toISOString(),
  });
}

/** Solo lectura (apta para consultas reactivas): el plan guardado o undefined. */
export async function readWeek(
  db: MealPrepDB,
  weekStart: ISODate,
): Promise<WeekPlan | undefined> {
  const stored = await db.weeks.get(weekStart);
  if (!stored) return undefined;
  const portions = await db.portions
    .where("weekStart")
    .equals(weekStart)
    .sortBy("eatOn");
  const { generatedAt: _, ...rest } = stored;
  return { ...rest, portions };
}

/** Devuelve el plan guardado de la semana o lo genera y guarda. */
export async function getOrCreateWeek(
  db: MealPrepDB,
  weekStart: ISODate,
): Promise<WeekPlan> {
  return (await readWeek(db, weekStart)) ?? regenerateWeek(db, weekStart);
}

/**
 * Genera el plan desde cero con el horario actual y lo guarda, conservando el estado
 * de lo que ya se cocinó (ver `carryOver`).
 */
export async function regenerateWeek(
  db: MealPrepDB,
  weekStart: ISODate,
  today?: ISODate,
): Promise<WeekPlan> {
  const { catalog, templates, settings } = await loadData(db);
  const templateId = templateIdForWeek(weekStart, settings.rotation);
  const template = templates.get(templateId);
  if (!template) throw new Error(`Plantilla "${templateId}" no existe`);

  const plan = buildWeek({
    weekStart,
    template,
    catalog,
    settings,
    events: await weekEvents(db, weekStart),
  });
  return db.transaction("rw", [db.weeks, db.portions], async () => {
    const prev = await db.portions
      .where("weekStart")
      .equals(weekStart)
      .toArray();
    const merged = carryOver(
      plan.portions,
      prev,
      today ?? todayIn(settings.timeZone),
    );
    const result: WeekPlan = {
      ...plan,
      portions: merged.portions,
      warnings: [...plan.warnings, ...merged.notes],
    };
    const { portions, ...week } = result;
    await db.portions.where("weekStart").equals(weekStart).delete();
    await db.weeks.put({ ...week, generatedAt: new Date().toISOString() });
    await db.portions.bulkPut(portions);
    return result;
  });
}

export async function actOnPortion(
  db: MealPrepDB,
  id: string,
  action: PortionAction,
): Promise<Portion> {
  return db.transaction("rw", db.portions, async () => {
    const portion = await db.portions.get(id);
    if (!portion) throw new Error(`Porción no encontrada: ${id}`);
    const next = applyAction(portion, action);
    await db.portions.put(next);
    return next;
  });
}

export async function inventoryMap(
  db: MealPrepDB,
): Promise<Map<string, number>> {
  const items = await db.inventory.toArray();
  return new Map(items.map((i) => [i.ingredientId, i.qty]));
}

export async function setInventory(
  db: MealPrepDB,
  ingredientId: string,
  qty: number,
): Promise<void> {
  if (qty <= 0) await db.inventory.delete(ingredientId);
  else
    await db.inventory.put({
      ingredientId,
      qty,
      updatedAt: new Date().toISOString(),
    });
}

export async function setCheck(
  db: MealPrepDB,
  date: ISODate,
  key: string,
  checked: boolean,
): Promise<void> {
  const id = `${date}:${key}`;
  if (checked)
    await db.checks.put({ id, date, checkedAt: new Date().toISOString() });
  else await db.checks.delete(id);
}

/** Claves marcadas ese día (sin el prefijo de fecha). */
export async function checksFor(
  db: MealPrepDB,
  date: ISODate,
): Promise<Set<string>> {
  const rows = await db.checks.where("date").equals(date).toArray();
  return new Set(rows.map((r) => r.id.slice(date.length + 1)));
}

export async function updateSettings(
  db: MealPrepDB,
  patch: Partial<Omit<Settings, "id">>,
): Promise<void> {
  await db.settings.update("default", patch);
}

/** Clave de compra marcada: `${tripId}:${ingredientId}` dentro de la semana. */
export async function setBought(
  db: MealPrepDB,
  weekStart: ISODate,
  key: string,
  checked: boolean,
): Promise<void> {
  const id = `${weekStart}:${key}`;
  if (checked) await db.shoppingChecks.put({ id, weekStart, checked: true });
  else await db.shoppingChecks.delete(id);
}

export async function boughtFor(
  db: MealPrepDB,
  weekStart: ISODate,
): Promise<Set<string>> {
  const rows = await db.shoppingChecks
    .where("weekStart")
    .equals(weekStart)
    .toArray();
  return new Set(rows.map((r) => r.id.slice(weekStart.length + 1)));
}

export interface CookState {
  startedAt: string | null;
  done: Set<string>;
  timers: TimerState[];
}

/** Clave de temporizador: `timer:${stepId}:${minutos}` (el id del paso puede tener ":"). */
export const timerKey = (stepId: string, minutes: number) =>
  `timer:${stepId}:${minutes}`;

/** Estado de una sesión de cocina: inicio y pasos marcados (en la tabla de casillas del día). */
export async function cookState(
  db: MealPrepDB,
  date: ISODate,
  prepId: string,
): Promise<CookState> {
  const prefix = `${date}:cook:${prepId}:`;
  const rows = await db.checks.where("date").equals(date).toArray();
  let startedAt: string | null = null;
  const done = new Set<string>();
  const timers: TimerState[] = [];
  for (const r of rows) {
    if (!r.id.startsWith(prefix)) continue;
    const key = r.id.slice(prefix.length);
    if (key === "start") startedAt = r.checkedAt;
    else if (key.startsWith("timer:")) {
      const body = key.slice("timer:".length);
      const cut = body.lastIndexOf(":");
      timers.push({
        stepId: body.slice(0, cut),
        minutes: Number(body.slice(cut + 1)),
        startedAt: Date.parse(r.checkedAt),
      });
    } else done.add(key);
  }
  return { startedAt, done, timers };
}

export async function resetCook(
  db: MealPrepDB,
  date: ISODate,
  prepId: string,
): Promise<void> {
  const prefix = `${date}:cook:${prepId}:`;
  const ids = (await db.checks.where("date").equals(date).primaryKeys()).filter(
    (id) => id.startsWith(prefix),
  );
  await db.checks.bulkDelete(ids);
}

export interface DayTimer extends TimerState {
  prepId: string;
}

/** Todos los temporizadores de cocina del día (para avisar desde cualquier pantalla). */
export async function timersOn(
  db: MealPrepDB,
  date: ISODate,
): Promise<DayTimer[]> {
  const rows = await db.checks.where("date").equals(date).toArray();
  const re = new RegExp(`^${date}:cook:([^:]+):timer:(.+):([0-9]+)$`);
  return rows.flatMap((r) => {
    const m = re.exec(r.id);
    if (!m) return [];
    return [
      {
        prepId: m[1],
        stepId: m[2],
        minutes: Number(m[3]),
        startedAt: Date.parse(r.checkedAt),
      },
    ];
  });
}
