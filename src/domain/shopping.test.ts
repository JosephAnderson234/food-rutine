import { DEFAULT_SETTINGS, WEEK_A } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import { catalog, seedWeek } from "../test/fixtures";
import { assemblyNutrition, round } from "./nutrition";
import { formatQty, roundUp, shoppingList, weekNeeds } from "./shopping";

const plan = seedWeek();
const needs = weekNeeds(plan, WEEK_A, catalog, DEFAULT_SETTINGS);
const find = (list: ReturnType<typeof shoppingList>, id: string) =>
  list.groups.flatMap((g) => g.items).find((i) => i.ingredientId === id);

describe("lista de compras", () => {
  it("pollo y carne en el rango del contexto (1–1.2 kg)", () => {
    const list = shoppingList(needs, new Map(), catalog);
    expect(find(list, "pollo")?.toBuy).toBeGreaterThanOrEqual(1000);
    expect(find(list, "pollo")?.toBuy).toBeLessThanOrEqual(1250);
    expect(find(list, "carne-molida")?.toBuy).toBeGreaterThanOrEqual(900);
    expect(find(list, "carne-molida")?.toBuy).toBeLessThanOrEqual(1250);
  });

  it("descuenta el inventario", () => {
    const list = shoppingList(
      needs,
      new Map([
        ["huevo", 5],
        ["arroz", 5000],
      ]),
      catalog,
    );
    expect(find(list, "huevo")?.toBuy).toBe((needs.get("huevo") ?? 0) - 5);
    expect(find(list, "arroz")).toBeUndefined();
  });

  it("los básicos solo se verifican", () => {
    const list = shoppingList(needs, new Map(), catalog);
    expect(list.pantry.map((p) => p.ingredientId)).toContain("sal");
    expect(find(list, "sal")).toBeUndefined();
  });

  it("agrupa en orden de categoría", () => {
    const list = shoppingList(needs, new Map(), catalog);
    expect(list.groups.map((g) => g.category)).toEqual([
      "proteina",
      "carbohidrato",
      "verdura",
      "fruta",
      "lacteo",
    ]);
  });

  it("redondea a cantidades comprables", () => {
    expect(roundUp(51, "g")).toBe(60);
    expect(roundUp(1120, "g")).toBe(1150);
    expect(roundUp(2.1, "u")).toBe(3);
    expect(roundUp(-10, "g")).toBe(0);
    expect(formatQty(1150, "g")).toBe("1.15 kg");
    expect(formatQty(1000, "ml")).toBe("1 L");
    expect(formatQty(650, "g")).toBe("650 g");
  });
});

describe("nutrición (solo medición)", () => {
  it("un bowl de pollo estándar ronda 600–800 kcal y 40–60 g de proteína", () => {
    const bowl = catalog.assemblies.get("bowl-pollo");
    if (!bowl) throw new Error("falta bowl-pollo");
    const n = round(
      assemblyNutrition(
        bowl,
        catalog.components,
        catalog.ingredients,
        "normal",
        DEFAULT_SETTINGS.portion.factor,
      ),
    );
    expect(n.kcal).toBeGreaterThan(600);
    expect(n.kcal).toBeLessThan(800);
    expect(n.proteinG).toBeGreaterThan(40);
    expect(n.proteinG).toBeLessThan(60);
  });

  it("la porción grande escala proteína, no los huevos", () => {
    const bowl = catalog.assemblies.get("bowl-carne-huevo");
    if (!bowl) throw new Error("falta bowl-carne-huevo");
    const f = DEFAULT_SETTINGS.portion.factor;
    const normal = assemblyNutrition(
      bowl,
      catalog.components,
      catalog.ingredients,
      "normal",
      f,
    );
    const grande = assemblyNutrition(
      bowl,
      catalog.components,
      catalog.ingredients,
      "grande",
      f,
    );
    expect(grande.kcal / normal.kcal).toBeGreaterThan(1.2);
    expect(grande.kcal / normal.kcal).toBeLessThan(1.3);
  });
});
