import { DEFAULT_SETTINGS, WEEK_A } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import { catalog, seedWeek } from "../test/fixtures";
import { shoppingList, weekNeeds } from "./shopping";
import { planTrips } from "./trips";

const plan = seedWeek();
const trips = (n: 1 | 2, inventory = new Map<string, number>()) =>
  planTrips({
    plan,
    template: WEEK_A,
    catalog,
    settings: DEFAULT_SETTINGS,
    inventory,
    trips: n,
  });
const qty = (t: ReturnType<typeof trips>[number], id: string) =>
  t.list.groups.flatMap((g) => g.items).find((i) => i.ingredientId === id)
    ?.toBuy;

describe("planTrips — 2 compras", () => {
  const [dom, mie] = trips(2);

  it("una compra por meal prep", () => {
    expect([dom.date, mie.date]).toEqual(["2026-09-27", "2026-09-30"]);
    expect(dom.prepNames).toEqual(["Meal prep domingo"]);
    expect(mie.prepNames).toEqual(["Meal prep miércoles"]);
  });

  it("el pollo va el domingo y la carne el miércoles", () => {
    expect(qty(dom, "pollo")).toBeGreaterThan(0);
    expect(qty(dom, "carne-molida")).toBeUndefined();
    expect(qty(mie, "carne-molida")).toBeGreaterThan(0);
    expect(qty(mie, "pollo")).toBeUndefined();
  });

  it("nada crudo necesita congelarse", () => {
    expect([...dom.freezeRaw, ...mie.freezeRaw]).toEqual([]);
  });

  it("los básicos solo se revisan en la primera compra", () => {
    expect(dom.list.pantry.length).toBeGreaterThan(0);
    expect(mie.list.pantry).toEqual([]);
  });

  it("los huevos del sábado se compran el miércoles, no el domingo", () => {
    // desayunos lun–mié + chaufa del martes → domingo; jue–sáb + bowl con huevo → miércoles
    expect(qty(dom, "huevo")).toBe(2 + 1);
    expect(qty(mie, "huevo")).toBe(2 + 2 + 1);
  });
});

describe("planTrips — 1 compra", () => {
  const [only] = trips(1);

  it("una sola compra el domingo con toda la proteína", () => {
    expect(only.date).toBe("2026-09-27");
    expect(qty(only, "pollo")).toBeGreaterThan(0);
    expect(qty(only, "carne-molida")).toBeGreaterThan(0);
  });

  it("la carne molida se congela cruda y se pasa a la refri el martes", () => {
    expect(only.freezeRaw).toEqual([
      {
        ingredientId: "carne-molida",
        name: "Carne molida de res",
        cookOn: "2026-09-30",
        thawOn: "2026-09-29",
      },
    ]);
  });

  it("suma lo mismo que la lista semanal completa", () => {
    const whole = shoppingList(
      weekNeeds(plan, WEEK_A, catalog, DEFAULT_SETTINGS),
      new Map(),
      catalog,
    );
    expect(only.list).toEqual(whole);
  });
});

describe("inventario entre compras", () => {
  it("lo que hay en casa cubre primero la compra del domingo", () => {
    const [dom, mie] = trips(2, new Map([["huevo", 4]]));
    expect(qty(dom, "huevo")).toBeUndefined();
    expect(qty(mie, "huevo")).toBe(4);
  });
});
