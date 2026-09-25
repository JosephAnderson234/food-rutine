import type { Assembly, Component, Ingredient } from "./types";

/** Catálogo indexado por id, listo para el motor. */
export interface Catalog {
  ingredients: Map<string, Ingredient>;
  components: Map<string, Component>;
  assemblies: Map<string, Assembly>;
}

export function makeCatalog(data: {
  ingredients: Ingredient[];
  components: Component[];
  assemblies: Assembly[];
}): Catalog {
  const catalog: Catalog = {
    ingredients: new Map(data.ingredients.map((i) => [i.id, i])),
    components: new Map(data.components.map((c) => [c.id, c])),
    assemblies: new Map(data.assemblies.map((a) => [a.id, a])),
  };
  validateCatalog(catalog);
  return catalog;
}

/** Falla temprano si una receta apunta a algo que no existe. */
export function validateCatalog({
  ingredients,
  components,
  assemblies,
}: Catalog): void {
  for (const c of components.values()) {
    for (const q of c.perPortion) {
      if (!ingredients.has(q.ingredientId))
        throw new Error(`${c.id}: ingrediente "${q.ingredientId}" no existe`);
    }
    if (c.batchPortions <= 0)
      throw new Error(`${c.id}: batchPortions debe ser > 0`);
  }
  for (const a of assemblies.values()) {
    for (const id of a.components) {
      if (!components.has(id))
        throw new Error(`${a.id}: componente "${id}" no existe`);
    }
    for (const q of a.extras ?? []) {
      if (!ingredients.has(q.ingredientId))
        throw new Error(`${a.id}: ingrediente "${q.ingredientId}" no existe`);
    }
  }
  for (const i of ingredients.values()) {
    if (i.unit === "u" && !i.gramsPerUnit)
      throw new Error(`${i.id}: unidad "u" requiere gramsPerUnit`);
  }
}
