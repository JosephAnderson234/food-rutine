import type { HHmm, ISODate, Weekday } from "./dates";

// ── Catálogo ────────────────────────────────────────────────────────────────

/** Clave semántica de ícono; la UI decide cómo dibujarla. */
export type FoodIcon =
  | "chicken"
  | "beef"
  | "rice"
  | "veggies"
  | "pasta"
  | "sauce"
  | "egg"
  | "bowl"
  | "wok"
  | "oats";

export type IngredientCategory =
  | "proteina"
  | "carbohidrato"
  | "verdura"
  | "fruta"
  | "lacteo"
  | "basico";

/** "u" = unidades (huevos, plátanos, panes). ml se trata como ≈ g para nutrición. */
export type Unit = "g" | "ml" | "u";

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: Unit;
  /** Peso comestible por unidad, requerido si unit = "u". */
  gramsPerUnit?: number;
  kcalPer100g: number;
  proteinPer100g: number;
  /** Básico de despensa: en compras se "verifica", no se cuantifica. */
  pantry?: boolean;
  /** Gramos o ml por cucharadita, para mostrar medidas de cocina en vez de gramos sueltos. */
  tsp?: number;
  /** Días que aguanta crudo en refri (USDA: aves y carne molida 1–2). Más → congelar crudo. */
  rawFridgeDays?: number;
}

export interface Qty {
  ingredientId: string;
  qty: number;
}

export type EquipmentId = "arrocera" | "wok" | "sarten" | "microondas";

export interface CookTask {
  id: string;
  label: string;
  equipment?: EquipmentId;
  /** Minutos que requieren atención de quien cocina. */
  activeMin: number;
  /** Minutos en que el equipo trabaja solo (arrocera, hervor). */
  passiveMin?: number;
  /** Se repite por cada tanda (el wok es chico). */
  perBatch?: boolean;
  /** Ids de tareas del mismo componente que deben terminar antes. */
  after?: string[];
  /** Nivel de fuego, si aplica. */
  heat?: Heat;
  /** Subpasos en orden, para el modo guía. */
  details?: string[];
  /** Señal para saber que el paso terminó ("Listo cuando…"). */
  cue?: string;
  /** Consejo o porqué (errores comunes, seguridad). */
  tip?: string;
  /** Ingredientes del componente que entran en este paso (se muestran con cantidad por tanda). */
  uses?: string[];
}

export type Heat = "bajo" | "medio" | "medio-alto" | "alto";

/** Algo que se cocina en lote y se reutiliza en varios platos. */
export interface Component {
  id: string;
  name: string;
  icon: FoodIcon;
  /** Ingredientes crudos para 1 porción estándar. */
  perPortion: Qty[];
  /** Porciones estándar que caben en una tanda de su equipo. */
  batchPortions: number;
  tasks: CookTask[];
  /** "salsa" va en recipiente pequeño aparte. */
  storage: "taper" | "salsa";
  safeTempC?: number;
}

/** Un plato del día = componentes ya cocinados + un acabado opcional. */
export interface Assembly {
  id: string;
  name: string;
  icon: FoodIcon;
  components: string[];
  /** Ingredientes frescos que se agregan al servir. */
  extras?: Qty[];
  finish?: { equipment: EquipmentId; minutes: number; note: string };
  /** Lleva sillao/ají en recipiente pequeño si se come fuera. */
  sauceOnSide?: boolean;
}

export type MealSlot = "desayuno" | "almuerzo" | "cena";
export const MEAL_SLOTS: MealSlot[] = ["desayuno", "almuerzo", "cena"];

export interface PrepTemplate {
  id: string;
  name: string;
  icon: FoodIcon;
  weekday: Weekday;
  preferredStart: HHmm;
  window: { from: HHmm; to: HHmm };
}

export interface MealTemplate {
  weekday: Weekday;
  slot: MealSlot;
  /** null = comida libre. */
  assemblyId: string | null;
  /** Sesión de prep que produce sus componentes. */
  prepId?: string;
}

export interface WeekTemplate {
  id: string;
  name: string;
  preps: PrepTemplate[];
  meals: MealTemplate[];
  /** Compras fijas de la semana (snacks, respaldo). */
  extras: Qty[];
}

// ── Horario ─────────────────────────────────────────────────────────────────

export type Modality = "presencial" | "virtual";

export interface FixedCourse {
  id: string;
  title: string;
  weekday: Weekday;
  start: HHmm;
  end: HHmm;
  modality: Modality;
  location?: string;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: ISODate;
  start: HHmm;
  end: HHmm;
  /** Fijo = curso (no se mueve). Flexible = todo lo demás. */
  kind: "fixed" | "flexible";
  modality?: Modality;
  source: "seed" | "google" | "app";
}

export interface GymPreference {
  weekday: Weekday;
  from: HHmm;
  to: HHmm;
}

// ── Configuración ───────────────────────────────────────────────────────────

export type PortionSize = "normal" | "grande";

export interface Settings {
  id: "default";
  timeZone: string;
  portion: { factor: Record<PortionSize, number>; gymDay: PortionSize };
  gym: { durationMin: number; preferences: GymPreference[] };
  safety: {
    /** Límite duro en refri (USDA: 3–4 días). Más allá, se congela sí o sí. */
    fridgeMaxDays: number;
    /** Preferencia: congelar lo que se coma después de N días. */
    freezeAfterDays: number;
    thawAt: HHmm;
  };
  lunchWindow: { from: HHmm; to: HHmm };
  containers: { large: number; small: number };
  /** Ids de WeekTemplate en orden de rotación. */
  rotation: string[];
  /** 1 = todo el domingo; 2 = una compra antes de cada meal prep (por defecto). */
  shoppingTrips?: 1 | 2;
}

// ── Plan de la semana ───────────────────────────────────────────────────────

export type PortionState =
  | "fridge"
  | "frozen"
  | "thawing"
  | "packed"
  | "eaten"
  | "discarded";

export interface Portion {
  id: string;
  weekStart: ISODate;
  prepId: string;
  assemblyId: string;
  componentIds: string[];
  cookedOn: ISODate;
  eatOn: ISODate;
  slot: MealSlot;
  size: PortionSize;
  state: PortionState;
  /** Táper grande asignado; undefined si se come recién hecho. */
  containerNo?: number;
  label: string;
}

export interface PlannedMeal {
  date: ISODate;
  slot: MealSlot;
  assemblyId: string | null;
  portionId?: string;
  where: "casa" | "u";
  size: PortionSize;
}

export interface PlannedSession {
  kind: "prep" | "gym";
  refId?: string;
  title: string;
  date: ISODate;
  start: HHmm;
  end: HHmm;
  /** Solo prep: porciones estándar por componente. */
  portionsByComponent?: Record<string, number>;
}

export type TaskKind =
  | "prep"
  | "gym"
  | "freeze"
  | "thaw"
  | "gelpacks"
  | "pack"
  | "finish";

export interface DayTask {
  id: string;
  date: ISODate;
  time?: HHmm;
  kind: TaskKind;
  label: string;
  portionId?: string;
}

export interface WeekPlan {
  weekStart: ISODate;
  templateId: string;
  sessions: PlannedSession[];
  meals: PlannedMeal[];
  portions: Portion[];
  tasks: DayTask[];
  warnings: string[];
}
