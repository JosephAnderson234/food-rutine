import type { Catalog } from "./catalog";
import {
  addDays,
  diffDays,
  formatDuration,
  fromMinutes,
  type ISODate,
  toMinutes,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  type Weekday,
  weekdayOf,
} from "./dates";
import { planPrep } from "./prep";
import { coolDeadline, storageFor } from "./safety";
import { campusSpan, findSlot, lunchAtCampus } from "./schedule";
import {
  type DayTask,
  MEAL_SLOTS,
  type MealSlot,
  type PlannedMeal,
  type PlannedSession,
  type Portion,
  type ScheduleEvent,
  type Settings,
  type TaskKind,
  type WeekPlan,
  type WeekTemplate,
} from "./types";

export interface BuildWeekInput {
  /** Domingo de la semana. */
  weekStart: ISODate;
  template: WeekTemplate;
  catalog: Catalog;
  /** Eventos de esa semana: cursos fijos + flexibles. */
  events: ScheduleEvent[];
  settings: Settings;
}

const GEL_PACKS_AT = "21:30";
const PACK_LEAD_MIN = 45;
const EARLIEST_PACK = 5 * 60 + 30;

/** Plantilla que toca según la rotación (A, B, C…) contando semanas desde una época fija. */
export function templateIdForWeek(
  weekStart: ISODate,
  rotation: string[],
): string {
  if (rotation.length === 0) throw new Error("La rotación está vacía");
  const weeks = Math.floor(diffDays("2026-01-04", weekStart) / 7);
  return rotation[
    ((weeks % rotation.length) + rotation.length) % rotation.length
  ];
}

/**
 * Horario → gym → comidas → porciones (refri/congelador) → táperes → sesiones de prep → tareas.
 * Determinista: misma entrada, mismo plan.
 */
export function buildWeek(input: BuildWeekInput): WeekPlan {
  const { weekStart, template, catalog, settings } = input;
  if (weekdayOf(weekStart) !== 0)
    throw new Error(`weekStart debe ser domingo: ${weekStart}`);

  const warnings: string[] = [];
  const tasks: DayTask[] = [];
  const sessions: PlannedSession[] = [];
  const events = [...input.events];
  const dateOf = (w: Weekday) => addDays(weekStart, w);
  const addTask = (
    date: ISODate,
    kind: TaskKind,
    label: string,
    time?: string,
    portionId?: string,
  ) =>
    tasks.push({
      id: `${date}:${kind}:${tasks.length}`,
      date,
      time,
      kind,
      label,
      portionId,
    });

  // 1. Gym en los huecos preferidos (o en otro hueco del mismo día).
  for (const pref of settings.gym.preferences) {
    const date = dateOf(pref.weekday);
    const day = WEEKDAY_LONG[pref.weekday];
    const durationMin = settings.gym.durationMin;
    let slot = findSlot(events, {
      date,
      durationMin,
      window: { from: pref.from, to: pref.to },
      preferredStart: pref.from,
    });
    if (!slot) {
      slot = findSlot(events, {
        date,
        durationMin,
        window: { from: "07:00", to: "21:00" },
        preferredStart: pref.from,
      });
      if (slot)
        warnings.push(
          `Gym del ${day} movido a ${slot.start}: el horario preferido está ocupado.`,
        );
    }
    if (!slot) {
      warnings.push(
        `No hay un hueco de ${formatDuration(durationMin)} para el gym del ${day}.`,
      );
      continue;
    }
    sessions.push({ kind: "gym", title: "Gym", date, ...slot });
    events.push({
      id: `gym@${date}`,
      title: "Gym",
      date,
      ...slot,
      kind: "flexible",
      source: "app",
    });
    addTask(date, "gym", `Gym ${slot.start}–${slot.end}`, slot.start);
  }
  const gymDates = new Set(sessions.map((s) => s.date));

  // 2. Comidas y porciones.
  const meals: PlannedMeal[] = [];
  const portions: Portion[] = [];
  const sortedMeals = [...template.meals].sort(
    (a, b) =>
      a.weekday - b.weekday ||
      MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot),
  );
  for (const mt of sortedMeals) {
    const date = dateOf(mt.weekday);
    const size =
      gymDates.has(date) && mt.slot !== "desayuno"
        ? settings.portion.gymDay
        : "normal";
    const where =
      mt.slot === "almuerzo" &&
      lunchAtCampus(events, date, settings.lunchWindow)
        ? "u"
        : "casa";
    const meal: PlannedMeal = {
      date,
      slot: mt.slot,
      assemblyId: mt.assemblyId,
      where,
      size,
    };

    const assembly = mt.assemblyId
      ? catalog.assemblies.get(mt.assemblyId)
      : undefined;
    if (mt.assemblyId && !assembly)
      throw new Error(`Plato desconocido: ${mt.assemblyId}`);

    if (
      assembly &&
      where === "u" &&
      assembly.finish &&
      assembly.finish.equipment !== "microondas"
    ) {
      warnings.push(
        `${assembly.name} (${WEEKDAY_SHORT[mt.weekday]}) necesita ${assembly.finish.equipment}: no se puede terminar en la U.`,
      );
    }

    if (assembly && mt.prepId) {
      const prep = template.preps.find((p) => p.id === mt.prepId);
      if (!prep) throw new Error(`Prep desconocido: ${mt.prepId}`);
      const cookedOn = dateOf(prep.weekday);
      const decision = storageFor(cookedOn, date, settings.safety);
      const id = `${weekStart}:${mt.weekday}:${mt.slot}`;
      const label = `${assembly.name} — ${WEEKDAY_SHORT[mt.weekday]} ${mt.slot}`;
      if (decision.state === "frozen" && decision.forced) {
        warnings.push(
          `${label}: supera ${settings.safety.fridgeMaxDays} días en refri, se congela obligatoriamente.`,
        );
      }
      portions.push({
        id,
        weekStart,
        prepId: prep.id,
        assemblyId: assembly.id,
        componentIds: assembly.components,
        cookedOn,
        eatOn: date,
        slot: mt.slot,
        size,
        state: decision.state,
        label,
      });
      meal.portionId = id;
    }
    meals.push(meal);
  }

  // 3. Táperes grandes (se reutilizan cuando la comida anterior ya se comió).
  assignContainers(portions, settings.containers.large, warnings);

  // 4. Sesiones de prep en el hueco libre más cercano a la hora preferida.
  for (const prep of template.preps) {
    const date = dateOf(prep.weekday);
    const own = portions.filter((p) => p.prepId === prep.id);
    if (own.length === 0) continue;

    const portionsByComponent: Record<string, number> = {};
    for (const p of own) {
      for (const cid of p.componentIds) {
        portionsByComponent[cid] =
          (portionsByComponent[cid] ?? 0) + settings.portion.factor[p.size];
      }
    }
    const components = Object.keys(portionsByComponent).map((id) => {
      const c = catalog.components.get(id);
      if (!c) throw new Error(`Componente desconocido: ${id}`);
      return c;
    });
    const stored = own.filter((p) => p.containerNo !== undefined).length;
    const plan = planPrep(components, portionsByComponent, stored);

    let slot = findSlot(events, {
      date,
      durationMin: plan.totalMin,
      window: prep.window,
      preferredStart: prep.preferredStart,
    });
    if (!slot) {
      const start = toMinutes(prep.preferredStart);
      slot = {
        start: prep.preferredStart,
        end: fromMinutes(start + plan.totalMin),
      };
      warnings.push(
        `${prep.name}: no hay hueco libre de ${formatDuration(plan.totalMin)}; se deja a las ${slot.start} y choca con otros eventos.`,
      );
    }
    sessions.push({
      kind: "prep",
      refId: prep.id,
      title: prep.name,
      date,
      ...slot,
      portionsByComponent,
    });
    events.push({
      id: `prep@${date}`,
      title: prep.name,
      date,
      ...slot,
      kind: "flexible",
      source: "app",
    });
    addTask(
      date,
      "prep",
      `${prep.name} · ${formatDuration(plan.totalMin)} · ${stored} táperes`,
      slot.start,
    );

    const deadline = coolDeadline(slot.end);
    for (const p of own.filter((x) => x.state === "frozen")) {
      addTask(
        date,
        "freeze",
        `Congelar ${containerName(p)} (${p.label}) antes de las ${deadline}`,
        slot.end,
        p.id,
      );
    }
  }

  // 5. Tareas derivadas de cada porción y cada día en el campus.
  for (const p of portions) {
    if (p.state === "frozen") {
      addTask(
        addDays(p.eatOn, -1),
        "thaw",
        `Pasar ${containerName(p)} (${p.label}) del congelador a la refri`,
        settings.safety.thawAt,
        p.id,
      );
    }
  }
  for (const meal of meals) {
    const assembly = meal.assemblyId
      ? catalog.assemblies.get(meal.assemblyId)
      : undefined;
    if (meal.where === "u") {
      const span = campusSpan(events, meal.date);
      const at = span
        ? fromMinutes(
            Math.max(EARLIEST_PACK, toMinutes(span.from) - PACK_LEAD_MIN),
          )
        : undefined;
      const portion = portions.find((p) => p.id === meal.portionId);
      const what = portion
        ? `${containerName(portion)} (${portion.label})`
        : (assembly?.name ?? "almuerzo");
      const coldPacks = settings.coldPacks ?? 0;
      addTask(
        meal.date,
        "pack",
        `Armar lonchera: ${what}${coldPacks > 0 ? ` + ${coldPacks} gel packs` : ""}`,
        at,
        meal.portionId,
      );
      if (coldPacks > 0) {
        addTask(
          addDays(meal.date, -1),
          "gelpacks",
          `Gel packs al congelador: mañana almuerzas en la U (${portion ? containerName(portion) : "táper"})`,
          GEL_PACKS_AT,
        );
      }
    } else if (
      meal.slot !== "desayuno" &&
      assembly?.finish &&
      assembly.finish.equipment !== "microondas"
    ) {
      addTask(
        meal.date,
        "finish",
        `${assembly.name}: ${assembly.finish.note} (${assembly.finish.minutes} min)`,
        undefined,
        meal.portionId,
      );
    }
  }

  tasks.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "99").localeCompare(b.time ?? "99"),
  );
  sessions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
  return {
    weekStart,
    templateId: template.id,
    sessions,
    meals,
    portions,
    tasks,
    warnings,
  };
}

export function containerName(p: Portion): string {
  return p.containerNo !== undefined
    ? `taper #${p.containerNo}`
    : "plato del día";
}

const slotIndex = (s: MealSlot) => MEAL_SLOTS.indexOf(s);

/**
 * Asigna táperes grandes. Se asume que el prep ocurre antes de la cena:
 * un táper vaciado en el almuerzo del mismo día ya sirve para el prep de esa noche.
 * Lo que se come el mismo día que se cocina no usa táper.
 */
function assignContainers(
  portions: Portion[],
  count: number,
  warnings: string[],
): void {
  const busyUntil: Array<{ date: ISODate; slot: MealSlot } | null> = Array.from(
    { length: count },
    () => null,
  );
  const ordered = [...portions].sort(
    (a, b) =>
      a.cookedOn.localeCompare(b.cookedOn) ||
      a.eatOn.localeCompare(b.eatOn) ||
      slotIndex(a.slot) - slotIndex(b.slot),
  );
  for (const p of ordered) {
    if (p.cookedOn === p.eatOn) continue;
    const free = busyUntil.findIndex(
      (b) =>
        b === null ||
        b.date < p.cookedOn ||
        (b.date === p.cookedOn && slotIndex(b.slot) < slotIndex("cena")),
    );
    if (free === -1) {
      warnings.push(
        `Faltan táperes: ${p.label} no tiene uno libre (tienes ${count}).`,
      );
      continue;
    }
    busyUntil[free] = { date: p.eatOn, slot: p.slot };
    p.containerNo = free + 1;
  }
}
