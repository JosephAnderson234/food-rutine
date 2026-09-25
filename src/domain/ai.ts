import { z } from "zod";
import type { Catalog } from "./catalog";
import {
  addDays,
  diffDays,
  type ISODate,
  toMinutes,
  WEEKDAY_LONG,
} from "./dates";
import type { Ingredient, ScheduleEvent } from "./types";

/**
 * La IA solo traduce texto libre a datos; el motor determinista planifica.
 * Los esquemas cumplen el modo estricto de Groq: todo requerido, sin campos opcionales.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ── Semana rota ─────────────────────────────────────────────────────────────

export const weekBlocksSchema = z.object({
  blocks: z
    .array(
      z.object({
        date: z.string().describe("Fecha YYYY-MM-DD, dentro de la semana dada"),
        start: z.string().describe("Hora de inicio HH:mm (24 h)"),
        end: z.string().describe("Hora de fin HH:mm (24 h)"),
        title: z.string().describe("Nombre corto del compromiso"),
      }),
    )
    .describe("Compromisos nuevos que bloquean horario"),
  summary: z.string().describe("Una frase: qué entendiste"),
  questions: z
    .array(z.string())
    .describe("Dudas si algo fue ambiguo (vacío si no hay)"),
});
export type WeekBlocks = z.infer<typeof weekBlocksSchema>;

export interface WeekContext {
  weekStart: ISODate;
  today: ISODate;
  days: { date: ISODate; dayName: string; busy: string[] }[];
}

export function weekContext(
  weekStart: ISODate,
  today: ISODate,
  events: ScheduleEvent[],
): WeekContext {
  return {
    weekStart,
    today,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return {
        date,
        dayName: WEEKDAY_LONG[i],
        busy: events
          .filter((e) => e.date === date)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((e) => `${e.start}-${e.end} ${e.title}`),
      };
    }),
  };
}

export function weekPrompt(
  ctx: WeekContext,
  text: string,
): { system: string; prompt: string } {
  return {
    system: [
      "Eres el asistente de una app de meal prep para un estudiante universitario en Lima.",
      "Tu único trabajo: convertir lo que escribe en bloques de horario ocupados (exámenes, trabajos, reuniones, viajes).",
      "Reglas:",
      "- Usa solo fechas de la semana dada. Resuelve 'jueves', 'mañana', 'pasado mañana' con la fecha de hoy.",
      "- Horas en formato 24 h HH:mm. Si dice 'en la noche' sin hora, usa 19:00-22:00; 'en la mañana' 08:00-12:00; 'en la tarde' 14:00-18:00; 'todo el día' 08:00-22:00.",
      "- Si falta la duración, asume 2 horas.",
      "- No inventes compromisos. No incluyas los que ya están en el horario.",
      "- Si algo es ambiguo, agrégalo como pregunta y no lo conviertas en bloque.",
      "- No planifiques comidas, gym ni meal prep: eso lo hace la app.",
    ].join("\n"),
    prompt: [
      `Hoy es ${ctx.today}. Semana:`,
      ...ctx.days.map(
        (d) =>
          `- ${d.dayName} ${d.date}: ${d.busy.length ? d.busy.join("; ") : "sin compromisos"}`,
      ),
      "",
      `Lo que escribió: """${text}"""`,
    ].join("\n"),
  };
}

export interface ValidBlocks {
  events: ScheduleEvent[];
  rejected: string[];
}

/** Descarta lo que la IA haya devuelto fuera de la semana o con horas inválidas. */
export function validateBlocks(
  out: WeekBlocks,
  weekStart: ISODate,
): ValidBlocks {
  const events: ScheduleEvent[] = [];
  const rejected: string[] = [];
  out.blocks.forEach((b, i) => {
    const d = DATE.test(b.date) ? diffDays(weekStart, b.date) : -1;
    const ok =
      d >= 0 &&
      d <= 6 &&
      HHMM.test(b.start) &&
      HHMM.test(b.end) &&
      toMinutes(b.start) < toMinutes(b.end);
    if (!ok) {
      rejected.push(`${b.title} (${b.date} ${b.start}-${b.end})`);
      return;
    }
    events.push({
      id: `ai:${weekStart}:${Date.now().toString(36)}:${i}`,
      title: b.title.trim() || "Ocupado",
      date: b.date,
      start: b.start,
      end: b.end,
      kind: "flexible",
      source: "app",
    });
  });
  return { events, rejected };
}

// ── Inventario por texto ────────────────────────────────────────────────────

/** El esquema se arma con los ids del catálogo: el modelo no puede inventar ingredientes. */
export function inventorySchema(ingredientIds: string[]) {
  return z.object({
    changes: z.array(
      z.object({
        ingredientId: z.enum(ingredientIds as [string, ...string[]]),
        op: z
          .enum(["add", "set", "remove"])
          .describe(
            "add = compré, set = me queda exactamente, remove = usé o se acabó",
          ),
        qty: z.number().describe("Cantidad en la unidad del ingrediente"),
      }),
    ),
    unknown: z
      .array(z.string())
      .describe("Cosas mencionadas que no están en el catálogo"),
    summary: z.string(),
  });
}
export type InventoryUpdate = z.infer<ReturnType<typeof inventorySchema>>;

export function inventoryPrompt(
  ingredients: Pick<Ingredient, "id" | "name" | "unit" | "gramsPerUnit">[],
  text: string,
): { system: string; prompt: string } {
  return {
    system: [
      "Conviertes lo que el usuario dice sobre su despensa en cambios de inventario.",
      "Usa SOLO los ids del catálogo. Convierte a la unidad del ingrediente:",
      "- g: '1 kg' = 1000, 'medio kilo' = 500. ml: '1 L' = 1000. u: unidades enteras ('una docena' = 12).",
      "- Si dice 'se acabó' o 'no tengo', usa op=set con qty=0.",
      "- Si menciona algo que no está en el catálogo, ponlo en unknown y no lo inventes.",
    ].join("\n"),
    prompt: [
      "Catálogo (id · nombre · unidad):",
      ...ingredients.map((i) => `- ${i.id} · ${i.name} · ${i.unit}`),
      "",
      `Lo que dijo: """${text}"""`,
    ].join("\n"),
  };
}

export interface InventoryPreview {
  ingredientId: string;
  name: string;
  before: number;
  after: number;
  unit: Ingredient["unit"];
}

/** Aplica los cambios sobre el inventario actual (sin guardar) para mostrarlos antes de confirmar. */
export function previewInventory(
  inventory: Map<string, number>,
  update: InventoryUpdate,
  catalog: Catalog,
): InventoryPreview[] {
  const next = new Map(inventory);
  const touched: string[] = [];
  for (const c of update.changes) {
    const ing = catalog.ingredients.get(c.ingredientId);
    if (!ing || !Number.isFinite(c.qty) || c.qty < 0) continue;
    const before = next.get(c.ingredientId) ?? 0;
    const after =
      c.op === "add"
        ? before + c.qty
        : c.op === "remove"
          ? Math.max(0, before - c.qty)
          : c.qty;
    next.set(c.ingredientId, after);
    if (!touched.includes(c.ingredientId)) touched.push(c.ingredientId);
  }
  return touched.map((id) => {
    const ing = catalog.ingredients.get(id) as Ingredient;
    return {
      ingredientId: id,
      name: ing.name,
      before: inventory.get(id) ?? 0,
      after: next.get(id) ?? 0,
      unit: ing.unit,
    };
  });
}
