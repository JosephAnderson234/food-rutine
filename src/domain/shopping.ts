import type { Catalog } from "./catalog";
import { assemblyQtys, scaleQty } from "./nutrition";
import type {
  Ingredient,
  IngredientCategory,
  Qty,
  Settings,
  WeekPlan,
  WeekTemplate,
} from "./types";

export const CATEGORY_ORDER: IngredientCategory[] = [
  "proteina",
  "carbohidrato",
  "verdura",
  "fruta",
  "lacteo",
  "basico",
];

export const CATEGORY_LABEL: Record<IngredientCategory, string> = {
  proteina: "Proteínas",
  carbohidrato: "Carbohidratos",
  verdura: "Verduras",
  fruta: "Frutas",
  lacteo: "Lácteos",
  basico: "Básicos",
};

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  /** Lo que pide el plan. */
  needed: number;
  /** Lo que falta comprar tras descontar el inventario, redondeado. */
  toBuy: number;
  unit: Ingredient["unit"];
  display: string;
}

export interface ShoppingList {
  groups: Array<{
    category: IngredientCategory;
    label: string;
    items: ShoppingItem[];
  }>;
  /** Básicos de despensa: solo verificar que haya. */
  pantry: Array<{ ingredientId: string; name: string }>;
}

/** Suma de ingredientes crudos que necesita el plan (comidas + extras de la semana). */
export function weekNeeds(
  plan: WeekPlan,
  template: WeekTemplate,
  catalog: Catalog,
  settings: Settings,
): Map<string, number> {
  const needs = new Map<string, number>();
  const push = ({ ingredientId, qty }: Qty, factor: number) => {
    const ing = catalog.ingredients.get(ingredientId);
    if (!ing) throw new Error(`Ingrediente desconocido: ${ingredientId}`);
    needs.set(
      ingredientId,
      (needs.get(ingredientId) ?? 0) + scaleQty(ing, qty, factor),
    );
  };
  for (const meal of plan.meals) {
    if (!meal.assemblyId) continue;
    const assembly = catalog.assemblies.get(meal.assemblyId);
    if (!assembly) throw new Error(`Plato desconocido: ${meal.assemblyId}`);
    const factor = settings.portion.factor[meal.size];
    for (const q of assemblyQtys(assembly, catalog.components)) push(q, factor);
  }
  for (const q of template.extras) push(q, 1);
  return needs;
}

/** Redondea hacia arriba a algo comprable: unidades enteras; g/ml de a 10 (poco) o de a 50. */
export function roundUp(qty: number, unit: Ingredient["unit"]): number {
  if (qty <= 1e-9) return 0;
  if (unit === "u") return Math.ceil(qty - 1e-9);
  const step = qty < 200 ? 10 : 50;
  return Math.ceil(qty / step - 1e-9) * step;
}

export function formatQty(qty: number, unit: Ingredient["unit"]): string {
  if (unit === "u") return `${qty} u`;
  if (qty < 1000) return `${qty} ${unit}`;
  return `${Number((qty / 1000).toFixed(2))} ${unit === "g" ? "kg" : "L"}`;
}

/** Lista de compras = necesidades − inventario, agrupada y redondeada a cantidades compra-bles. */
export function shoppingList(
  needs: Map<string, number>,
  inventory: Map<string, number>,
  catalog: Catalog,
): ShoppingList {
  const groups = new Map<IngredientCategory, ShoppingItem[]>();
  const pantry: ShoppingList["pantry"] = [];

  for (const [ingredientId, needed] of needs) {
    const ing = catalog.ingredients.get(ingredientId);
    if (!ing) continue;
    if (ing.pantry) {
      pantry.push({ ingredientId, name: ing.name });
      continue;
    }
    const toBuy = roundUp(
      needed - (inventory.get(ingredientId) ?? 0),
      ing.unit,
    );
    if (toBuy === 0) continue;
    const list = groups.get(ing.category) ?? [];
    list.push({
      ingredientId,
      name: ing.name,
      needed,
      toBuy,
      unit: ing.unit,
      display: formatQty(toBuy, ing.unit),
    });
    groups.set(ing.category, list);
  }

  return {
    groups: CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => ({
      category,
      label: CATEGORY_LABEL[category],
      items: (groups.get(category) ?? []).sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      ),
    })),
    pantry: pantry.sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
