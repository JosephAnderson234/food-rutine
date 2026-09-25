import type {
  Assembly,
  Component,
  Ingredient,
  PortionSize,
  Qty,
} from "./types";

/**
 * Medición informativa: calorías y proteína. No hay metas ni recomendaciones;
 * las porciones se deciden por hambre (normal / grande).
 */
export interface Nutrition {
  kcal: number;
  proteinG: number;
}

export const ZERO: Nutrition = { kcal: 0, proteinG: 0 };

export function gramsOf(ingredient: Ingredient, qty: number): number {
  if (ingredient.unit === "u") {
    if (!ingredient.gramsPerUnit)
      throw new Error(`${ingredient.id}: falta gramsPerUnit`);
    return qty * ingredient.gramsPerUnit;
  }
  return qty; // g, o ml ≈ g
}

/** Escala una cantidad según el tamaño de porción. Las unidades (huevos, panes) no se escalan. */
export function scaleQty(
  ingredient: Ingredient,
  qty: number,
  factor: number,
): number {
  return ingredient.unit === "u" ? qty : qty * factor;
}

export function add(a: Nutrition, b: Nutrition): Nutrition {
  return { kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG };
}

export function nutritionOf(
  qtys: Qty[],
  ingredients: Map<string, Ingredient>,
  factor = 1,
): Nutrition {
  return qtys.reduce((acc, { ingredientId, qty }) => {
    const ing = ingredients.get(ingredientId);
    if (!ing) throw new Error(`Ingrediente desconocido: ${ingredientId}`);
    const g = gramsOf(ing, scaleQty(ing, qty, factor));
    return add(acc, {
      kcal: (g * ing.kcalPer100g) / 100,
      proteinG: (g * ing.proteinPer100g) / 100,
    });
  }, ZERO);
}

/** Ingredientes crudos de 1 porción estándar de un plato (componentes + extras). */
export function assemblyQtys(
  assembly: Assembly,
  components: Map<string, Component>,
): Qty[] {
  const fromComponents = assembly.components.flatMap((id) => {
    const c = components.get(id);
    if (!c) throw new Error(`Componente desconocido: ${id}`);
    return c.perPortion;
  });
  return [...fromComponents, ...(assembly.extras ?? [])];
}

export function assemblyNutrition(
  assembly: Assembly,
  components: Map<string, Component>,
  ingredients: Map<string, Ingredient>,
  size: PortionSize,
  factors: Record<PortionSize, number>,
): Nutrition {
  return nutritionOf(
    assemblyQtys(assembly, components),
    ingredients,
    factors[size],
  );
}

export function round(n: Nutrition): Nutrition {
  return {
    kcal: Math.round(n.kcal / 10) * 10,
    proteinG: Math.round(n.proteinG),
  };
}
