import type {
  Assembly,
  Component,
  FixedCourse,
  Ingredient,
  Portion,
  ScheduleEvent,
  Settings,
  WeekPlan,
  WeekTemplate,
} from "@app/domain/types";
import Dexie, { type EntityTable } from "dexie";
import { ASSEMBLIES, COMPONENTS, INGREDIENTS, WEEK_TEMPLATES } from "./seed";

/** Plan guardado sin las porciones: esas viven en su propia tabla porque cambian de estado. */
export type StoredWeek = Omit<WeekPlan, "portions"> & { generatedAt: string };

export interface InventoryItem {
  ingredientId: string;
  qty: number;
  updatedAt: string;
}

export interface ShoppingCheck {
  /** `${weekStart}:${ingredientId}` */
  id: string;
  weekStart: string;
  checked: boolean;
}

/** Eventos de Google ya convertidos, por semana: permite planificar sin internet. */
export interface CalendarCache {
  weekStart: string;
  fetchedAt: string;
  events: ScheduleEvent[];
}

/** Tarea ya enviada a Todoist (para no duplicar ni revivir lo tachado). */
export interface TodoSentRow {
  key: string;
  weekStart: string;
  taskId: string;
  fingerprint: string;
}

/** Casilla marcada del día: tareas de la agenda e ítems de la mochila. */
export interface DayCheck {
  /** `${date}:task:${taskId}` o `${date}:pack:${itemId}` */
  id: string;
  date: string;
  checkedAt: string;
}

export class MealPrepDB extends Dexie {
  ingredients!: EntityTable<Ingredient, "id">;
  components!: EntityTable<Component, "id">;
  assemblies!: EntityTable<Assembly, "id">;
  weekTemplates!: EntityTable<WeekTemplate, "id">;
  fixedCourses!: EntityTable<FixedCourse, "id">;
  settings!: EntityTable<Settings, "id">;
  weeks!: EntityTable<StoredWeek, "weekStart">;
  portions!: EntityTable<Portion, "id">;
  inventory!: EntityTable<InventoryItem, "ingredientId">;
  shoppingChecks!: EntityTable<ShoppingCheck, "id">;
  checks!: EntityTable<DayCheck, "id">;
  calendarCache!: EntityTable<CalendarCache, "weekStart">;
  todoSent!: EntityTable<TodoSentRow, "key">;

  constructor(name = "meal-prep") {
    super(name);
    this.version(1).stores({
      ingredients: "id, category",
      components: "id",
      assemblies: "id",
      weekTemplates: "id",
      fixedCourses: "id, weekday",
      settings: "id",
      weeks: "weekStart",
      portions: "id, weekStart, eatOn, state",
      inventory: "ingredientId",
      shoppingChecks: "id, weekStart",
    });
    // v2: emoji → icon en el catálogo. Se recarga el catálogo y se regeneran los planes
    // (los textos de tareas y porciones guardados todavía traían emojis).
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table("components").clear();
        await tx.table("components").bulkPut(COMPONENTS);
        await tx.table("assemblies").clear();
        await tx.table("assemblies").bulkPut(ASSEMBLIES);
        await tx.table("weekTemplates").clear();
        await tx.table("weekTemplates").bulkPut(WEEK_TEMPLATES);
        await tx.table("weeks").clear();
        await tx.table("portions").clear();
      });
    // v3: casillas del día (agenda y mochila).
    this.version(3).stores({ checks: "id, date" });
    // v4: ingredientes con frescura cruda (rawFridgeDays). El catálogo aún no es editable,
    // así que se reemplaza completo; porciones y casillas no se tocan.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table("ingredients").bulkPut(INGREDIENTS);
      });
    // v5: recetas con instrucciones detalladas (fuego, subpasos, "listo cuando") y medidas
    // de cocina en ingredientes. Mismos ids de tarea: las casillas guardadas se conservan.
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table("ingredients").bulkPut(INGREDIENTS);
        await tx.table("components").bulkPut(COMPONENTS);
      });
    // v6: caché de eventos de Google Calendar por semana.
    this.version(6).stores({ calendarCache: "weekStart" });
    // v7: tareas enviadas a Todoist.
    this.version(7).stores({ todoSent: "key, weekStart" });
  }
}

let instance: MealPrepDB | undefined;

/** Instancia única en el navegador. */
export function getDB(): MealPrepDB {
  instance ??= new MealPrepDB();
  return instance;
}
