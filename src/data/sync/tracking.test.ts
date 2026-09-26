import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MealPrepDB } from "../db";
import { getOrCreateWeek, seedIfEmpty, setInventory } from "../repo";
import { markRemote } from "./tracking";

let db: MealPrepDB;
let n = 0;
beforeEach(async () => {
  db = new MealPrepDB(`tracking-${n++}`);
});
afterEach(async () => {
  await db.delete();
});

const outbox = () => db.outbox.toArray();

describe("syncTracking", () => {
  it("cada escritura en una tabla sincronizada queda en el outbox", async () => {
    await setInventory(db, "huevo", 6);
    const entries = await outbox();
    expect(entries).toEqual([
      expect.objectContaining({ collection: "inventory", docId: "huevo" }),
    ]);
  });

  it("los borrados también se anotan", async () => {
    await setInventory(db, "huevo", 6);
    await setInventory(db, "huevo", 0);
    expect((await outbox()).map((e) => e.docId)).toEqual(["huevo", "huevo"]);
  });

  it("anota una entrada por documento en escrituras masivas", async () => {
    await seedIfEmpty(db);
    await getOrCreateWeek(db, "2026-09-27");
    const portions = (await outbox()).filter(
      (e) => e.collection === "portions",
    );
    expect(portions).toHaveLength(11);
  });

  it("no anota tablas locales (outbox, meta, sesión)", async () => {
    await db.meta.put({ key: "cursor", value: "5" });
    expect(await outbox()).toEqual([]);
  });

  it("lo que viene del servidor no se vuelve a anotar", async () => {
    await db.transaction("rw", db.inventory, async (tx) => {
      markRemote(tx.idbtrans);
      await db.inventory.put({
        ingredientId: "pollo",
        qty: 500,
        updatedAt: "x",
      });
    });
    expect(await outbox()).toEqual([]);
    expect((await db.inventory.get("pollo"))?.qty).toBe(500);
  });

  it("si la transacción falla, tampoco queda en el outbox", async () => {
    await expect(
      db.transaction("rw", db.inventory, async () => {
        await db.inventory.put({
          ingredientId: "pollo",
          qty: 1,
          updatedAt: "x",
        });
        throw new Error("falla");
      }),
    ).rejects.toThrow("falla");
    expect(await outbox()).toEqual([]);
  });
});
