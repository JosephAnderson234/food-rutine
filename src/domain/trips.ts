import type { Catalog } from "./catalog";
import { addDays, diffDays, type ISODate } from "./dates";
import { assemblyQtys, scaleQty } from "./nutrition";
import { type ShoppingList, shoppingList } from "./shopping";
import type { Qty, Settings, WeekPlan, WeekTemplate } from "./types";

export interface FreezeRaw {
  ingredientId: string;
  name: string;
  /** Cuándo se cocina (último uso de esta compra). */
  cookOn: ISODate;
  /** Pasar del congelador a la refri la noche anterior. */
  thawOn: ISODate;
}

export interface Trip {
  id: string;
  date: ISODate;
  /** Sesiones de prep que abastece esta compra. */
  prepNames: string[];
  list: ShoppingList;
  /** Carnes crudas que no aguantan en refri hasta que se cocinan. */
  freezeRaw: FreezeRaw[];
}

export interface TripsInput {
  plan: WeekPlan;
  template: WeekTemplate;
  catalog: Catalog;
  settings: Settings;
  /** Lo que ya hay en casa; se descuenta empezando por la primera compra. */
  inventory: Map<string, number>;
  trips: 1 | 2;
}

/**
 * Reparte la lista de la semana en compras.
 * Cada necesidad va a la compra más tardía que llegue a tiempo: los componentes
 * del prep al día del prep y los frescos al servir (huevo) al día en que se comen.
 */
export function planTrips(input: TripsInput): Trip[] {
  const { plan, template, catalog, settings, trips } = input;
  const preps = template.preps
    .map((p) => ({ ...p, date: addDays(plan.weekStart, p.weekday) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (preps.length === 0) return [];

  const dates =
    trips === 1 ? [preps[0].date] : [...new Set(preps.map((p) => p.date))];
  const tripIndex = (neededOn: ISODate) =>
    dates.reduce((idx, d, i) => (d <= neededOn ? i : idx), 0);

  const needs = dates.map(() => new Map<string, number>());
  const lastUse = dates.map(() => new Map<string, ISODate>());
  const add = (
    { ingredientId, qty }: Qty,
    factor: number,
    neededOn: ISODate,
  ) => {
    const ing = catalog.ingredients.get(ingredientId);
    if (!ing) throw new Error(`Ingrediente desconocido: ${ingredientId}`);
    const i = tripIndex(neededOn);
    needs[i].set(
      ingredientId,
      (needs[i].get(ingredientId) ?? 0) + scaleQty(ing, qty, factor),
    );
    const prev = lastUse[i].get(ingredientId);
    if (!prev || neededOn > prev) lastUse[i].set(ingredientId, neededOn);
  };

  for (const meal of plan.meals) {
    if (!meal.assemblyId) continue;
    const assembly = catalog.assemblies.get(meal.assemblyId);
    if (!assembly) throw new Error(`Plato desconocido: ${meal.assemblyId}`);
    const factor = settings.portion.factor[meal.size];
    const cookOn = plan.portions.find((p) => p.id === meal.portionId)?.cookedOn;
    const fromComponents = assemblyQtys(
      { ...assembly, extras: [] },
      catalog.components,
    );
    for (const q of fromComponents) add(q, factor, cookOn ?? meal.date);
    for (const q of assembly.extras ?? []) add(q, factor, meal.date);
  }
  for (const q of template.extras) add(q, 1, dates[0]);

  // El inventario cubre primero la compra más temprana.
  const inventory = new Map(input.inventory);
  const remaining = needs.map((tripNeeds) => {
    const rest = new Map<string, number>();
    for (const [id, qty] of tripNeeds) {
      const have = inventory.get(id) ?? 0;
      const used = Math.min(have, qty);
      inventory.set(id, have - used);
      rest.set(id, qty - used);
    }
    return rest;
  });

  return dates.map((date, i) => {
    const list = shoppingList(remaining[i], new Map(), catalog);
    if (i > 0) list.pantry = [];
    const toBuy = new Set(
      list.groups.flatMap((g) => g.items.map((it) => it.ingredientId)),
    );
    const freezeRaw: FreezeRaw[] = [];
    for (const [id, cookOn] of lastUse[i]) {
      const ing = catalog.ingredients.get(id);
      if (!ing?.rawFridgeDays || !toBuy.has(id)) continue;
      if (diffDays(date, cookOn) > ing.rawFridgeDays) {
        freezeRaw.push({
          ingredientId: id,
          name: ing.name,
          cookOn,
          thawOn: addDays(cookOn, -1),
        });
      }
    }
    return {
      id: `trip-${date}`,
      date,
      prepNames: preps
        .filter((p) => tripIndex(p.date) === i)
        .map((p) => p.name),
      list,
      freezeRaw,
    };
  });
}
