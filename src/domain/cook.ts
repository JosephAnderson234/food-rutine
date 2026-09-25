import type { Catalog } from "./catalog";
import {
  fromMinutes,
  type HHmm,
  type ISODate,
  toMinutes,
  WEEKDAY_SHORT,
  weekdayOf,
} from "./dates";
import { formatKitchen } from "./measures";
import { type PrepPlan, type PrepStep, planPrep } from "./prep";
import { coolDeadline } from "./safety";
import type {
  Component,
  EquipmentId,
  FoodIcon,
  Heat,
  MealSlot,
  PlannedSession,
  WeekPlan,
} from "./types";

export interface CookStep extends PrepStep {
  componentName: string | null;
  icon: FoodIcon | null;
  /** Hora de reloj según el inicio planificado de la sesión. */
  at: HHmm;
  safeTempC?: number;
  heat?: Heat;
  /** Subpasos del paso, en orden. */
  details: string[];
  cue?: string;
  tip?: string;
  /** Cantidades de esta tanda (o del total si no va por tandas). */
  amounts: { ingredientId: string; name: string; display: string }[];
}

export interface ContainerSlot {
  containerNo: number | null;
  portionId: string;
  assemblyName: string;
  icon: FoodIcon;
  eatOn: ISODate;
  slot: MealSlot;
  size: "normal" | "grande";
  storage: "refri" | "congelador" | "servir";
  /** Texto para la etiqueta de masking tape. */
  tag: string;
}

export interface CookView {
  session: PlannedSession & { refId: string };
  plan: PrepPlan;
  steps: CookStep[];
  containers: ContainerSlot[];
  before: string[];
  /** Hora límite para refrigerar si se termina a tiempo. */
  coolBy: HHmm;
  equipment: EquipmentId[];
}

/** Sesiones de prep de la semana, en orden. */
export function prepSessions(
  plan: WeekPlan,
): (PlannedSession & { refId: string })[] {
  return plan.sessions.filter(
    (s): s is PlannedSession & { refId: string } =>
      s.kind === "prep" && s.refId !== undefined,
  );
}

export function buildCook(
  plan: WeekPlan,
  catalog: Catalog,
  prepId: string,
): CookView {
  const session = prepSessions(plan).find((s) => s.refId === prepId);
  if (!session?.portionsByComponent)
    throw new Error(`Sin sesión de prep: ${prepId}`);

  const own = plan.portions
    .filter((p) => p.prepId === prepId)
    .sort((a, b) => (a.containerNo ?? 99) - (b.containerNo ?? 99));
  const stored = own.filter((p) => p.containerNo !== undefined);
  const components = Object.keys(session.portionsByComponent).map((id) => {
    const c = catalog.components.get(id);
    if (!c) throw new Error(`Componente desconocido: ${id}`);
    return c;
  });
  const prep = planPrep(components, session.portionsByComponent, stored.length);
  const start = toMinutes(session.start);

  const portionsByComponent = session.portionsByComponent;
  const steps: CookStep[] = prep.steps.map((s) => {
    const c = s.componentId ? catalog.components.get(s.componentId) : undefined;
    const task = c?.tasks.find((t) => t.id === taskIdOf(s.id));
    return {
      ...s,
      componentName: c?.name ?? null,
      icon: c?.icon ?? null,
      at: fromMinutes(start + s.start),
      safeTempC: s.equipment === "wok" ? c?.safeTempC : undefined,
      heat: task?.heat,
      details: task?.details ?? [],
      cue: task?.cue,
      tip: task?.tip,
      amounts:
        c && task?.uses
          ? amountsFor(
              c,
              task.uses,
              portionsByComponent[c.id] ?? 0,
              s.batch?.of ?? 1,
              catalog,
            )
          : [],
    };
  });

  const containers: ContainerSlot[] = own.map((p) => {
    const a = catalog.assemblies.get(p.assemblyId);
    const day = WEEKDAY_SHORT[weekdayOf(p.eatOn)];
    return {
      containerNo: p.containerNo ?? null,
      portionId: p.id,
      assemblyName: a?.name ?? p.assemblyId,
      icon: a?.icon ?? "bowl",
      eatOn: p.eatOn,
      slot: p.slot,
      size: p.size,
      storage:
        p.containerNo === undefined
          ? "servir"
          : p.state === "frozen"
            ? "congelador"
            : "refri",
      tag: `${day} ${p.slot} · ${a?.name.split(" ")[0] ?? ""} · ${formatTagDate(session.date)}`,
    };
  });

  const coolBy = coolDeadline(session.end);
  const armado = steps.find((s) => s.id === "armado");
  if (armado) {
    const hasBig = containers.some(
      (c) => c.size === "grande" && c.containerNo !== null,
    );
    armado.details = [
      ...containers
        .filter((c) => c.containerNo !== null)
        .map(
          (c) =>
            `Táper #${c.containerNo}: ${c.assemblyName}${c.size === "grande" ? " (porción grande)" : ""} → ${c.storage === "congelador" ? "congelador" : "refri"}.`,
        ),
      hasBig
        ? "Reparte en partes iguales; los de porción grande llevan ~⅓ más."
        : "Reparte en partes iguales.",
      "Deja salir el vapor 10–15 min sin tapar, en capa baja.",
      "Tapa, pega la etiqueta y guarda.",
    ];
    armado.cue = `Todo tapado, etiquetado y guardado antes de las ${coolBy}.`;
    armado.tip =
      "Nunca metas a la refri una olla grande llena y caliente: el centro tarda horas en enfriar.";
  }

  const salsas = components.filter((c) => c.storage === "salsa").length;
  const equipment = [
    ...new Set(steps.flatMap((s) => (s.equipment ? [s.equipment] : []))),
  ];
  const before = [
    `Lavar y secar ${stored.length} táperes grandes${salsas ? ` y ${salsas} pequeño${salsas > 1 ? "s" : ""} para salsa` : ""}.`,
    "Tabla y cuchillo para carne cruda separados de lo que ya está cocido.",
    "Cinta de papel y plumón para etiquetar.",
    "Espacio libre en la refri (y en el congelador si algo va congelado).",
  ];

  return {
    session,
    plan: prep,
    steps,
    containers,
    before,
    coolBy,
    equipment,
  };
}

/** "pollo:saltear#2" → "saltear" */
function taskIdOf(stepId: string): string {
  return stepId.split(":")[1]?.split("#")[0] ?? stepId;
}

function amountsFor(
  component: Component,
  uses: string[],
  portions: number,
  batches: number,
  catalog: Catalog,
): CookStep["amounts"] {
  return uses.flatMap((id) => {
    const per = component.perPortion.find((q) => q.ingredientId === id);
    const ing = catalog.ingredients.get(id);
    if (!per || !ing) return [];
    return [
      {
        ingredientId: id,
        name: ing.name,
        display: formatKitchen(ing, (per.qty * portions) / batches),
      },
    ];
  });
}

function formatTagDate(date: ISODate): string {
  const [, m, d] = date.split("-");
  return `hecho ${d}/${m}`;
}

export interface LiveStatus {
  /** Lo que deberías estar haciendo (activo, sin marcar). */
  now: CookStep[];
  /** Lo que el equipo hace solo, con minutos restantes. */
  running: { step: CookStep; remainingMin: number }[];
  next: CookStep | null;
  /** Minutos de atraso respecto al plan (0 si vas a tiempo). */
  behindMin: number;
  finished: boolean;
}

/**
 * Estado en vivo a partir de los minutos desde que empezaste y lo ya marcado.
 * "Ahora" prioriza lo pendiente más antiguo: si te atrasaste, eso sigue primero.
 */
export function liveStatus(
  cook: CookView,
  elapsedMin: number,
  done: Set<string>,
): LiveStatus {
  const pending = cook.steps.filter((s) => !done.has(s.id));
  if (pending.length === 0) {
    return { now: [], running: [], next: null, behindMin: 0, finished: true };
  }
  const due = pending.filter((s) => s.start <= elapsedMin);
  const now = due.length > 0 ? due.slice(0, 2) : [];
  const next = pending.find((s) => s.start > elapsedMin) ?? null;
  const running = cook.steps
    .filter(
      (s) =>
        done.has(s.id) &&
        s.end > s.activeEnd &&
        elapsedMin >= s.activeEnd &&
        elapsedMin < s.end,
    )
    .map((step) => ({ step, remainingMin: step.end - elapsedMin }));
  const oldest = due[0];
  return {
    now,
    running,
    next,
    behindMin: oldest ? Math.max(0, elapsedMin - oldest.activeEnd) : 0,
    finished: false,
  };
}

export interface TimerState {
  stepId: string;
  /** Epoch ms en que se inició. */
  startedAt: number;
  minutes: number;
}

export interface TimerView {
  stepId: string;
  label: string;
  remainingSec: number;
  done: boolean;
}

/** Cuenta regresiva de cada temporizador, ordenada por lo que termina antes. */
export function timerViews(
  timers: TimerState[],
  steps: CookStep[],
  nowMs: number,
): TimerView[] {
  return timers
    .map((t) => {
      const step = steps.find((s) => s.id === t.stepId);
      const remainingSec = Math.ceil(
        (t.startedAt + t.minutes * 60_000 - nowMs) / 1000,
      );
      return {
        stepId: t.stepId,
        label:
          step?.equipment === "arrocera"
            ? "Arrocera"
            : (step?.componentName ?? step?.label ?? "Temporizador"),
        remainingSec: Math.max(0, remainingSec),
        done: remainingSec <= 0,
      };
    })
    .sort((a, b) => a.remainingSec - b.remainingSec);
}
