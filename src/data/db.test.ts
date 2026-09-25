import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { MealPrepDB } from "./db";

describe("migración v1 → v2", () => {
  it("reemplaza emoji por icon y descarta planes viejos", async () => {
    const name = "migration-test";
    const v1 = new Dexie(name);
    v1.version(1).stores({
      components: "id",
      assemblies: "id",
      weekTemplates: "id",
      weeks: "weekStart",
      portions: "id, weekStart, eatOn, state",
    });
    await v1.table("components").put({ id: "pollo", emoji: "🍗" });
    await v1.table("weeks").put({ weekStart: "2026-09-20" });
    await v1.table("portions").put({
      id: "x",
      weekStart: "2026-09-20",
      eatOn: "2026-09-21",
      state: "fridge",
    });
    v1.close();

    const db = new MealPrepDB(name);
    const pollo = await db.components.get("pollo");
    expect(pollo?.icon).toBe("chicken");
    expect(pollo).not.toHaveProperty("emoji");
    expect(await db.weeks.count()).toBe(0);
    expect(await db.portions.count()).toBe(0);
    await db.delete();
  });
});
