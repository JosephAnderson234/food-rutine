import "fake-indexeddb/auto";
import type {
  AuthedApi,
  PulledChange,
  RemoteChange,
} from "@app/integrations/backend/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MealPrepDB } from "../db";
import {
  actOnPortion,
  getOrCreateWeek,
  seedIfEmpty,
  setInventory,
  updateSettings,
} from "../repo";
import {
  fromRemote,
  linkDevice,
  pendingCount,
  syncOnce,
  toRemote,
} from "./engine";

/** Servidor en memoria con las mismas reglas que food-rutine-api (LWW; porciones no retroceden). */
function fakeServer() {
  const RANK: Record<string, number> = {
    fridge: 0,
    frozen: 0,
    thawing: 1,
    packed: 2,
    eaten: 3,
    discarded: 3,
  };
  const docs = new Map<string, PulledChange>();
  let seq = 0;
  const api: Pick<AuthedApi, "push" | "pull"> = {
    async push(changes: RemoteChange[]) {
      let applied = 0;
      for (const c of changes) {
        const key = `${c.collection}|${c.docId}`;
        const cur = docs.get(key);
        let data = c.data;
        let at = c.clientUpdatedAt;
        if (cur && !cur.deleted && c.data && c.collection === "portions") {
          const inc = (c.data as { state: string }).state;
          const old = (cur.data as { state: string }).state;
          if (c.clientUpdatedAt <= cur.clientUpdatedAt) {
            if (RANK[inc] <= RANK[old]) continue;
            data = { ...(cur.data as object), state: inc };
            at = cur.clientUpdatedAt;
          } else if (RANK[inc] < RANK[old]) {
            data = { ...(c.data as object), state: old };
          }
        } else if (cur && c.clientUpdatedAt <= cur.clientUpdatedAt) {
          continue;
        }
        seq++;
        applied++;
        docs.set(key, {
          collection: c.collection,
          docId: c.docId,
          data,
          deleted: data === null,
          clientUpdatedAt: at,
          version: String(seq),
        });
      }
      return {
        applied,
        skipped: changes.length - applied,
        cursor: String(seq),
      };
    },
    async pull(since: string, limit: number) {
      const all = [...docs.values()]
        .filter((d) => Number(d.version) > Number(since))
        .sort((a, b) => Number(a.version) - Number(b.version));
      const page = all.slice(0, limit);
      return {
        changes: page,
        cursor: page.at(-1)?.version ?? since,
        hasMore: all.length > limit,
      };
    },
  };
  return { api, docs };
}

let n = 0;
const dbs: MealPrepDB[] = [];
async function device(): Promise<MealPrepDB> {
  const db = new MealPrepDB(`device-${n++}`);
  dbs.push(db);
  await seedIfEmpty(db);
  return db;
}

beforeEach(() => {
  dbs.length = 0;
});
afterEach(async () => {
  for (const db of dbs) await db.delete();
});

const WEEK = "2026-09-27";
const lunch = (db: MealPrepDB) =>
  db.portions
    .where("weekStart")
    .equals(WEEK)
    .filter((p) => p.eatOn === "2026-09-28" && p.slot === "almuerzo")
    .first();

describe("sincronización entre dispositivos", () => {
  it("lo que marcas en el celular aparece en la laptop", async () => {
    const server = fakeServer();
    const phone = await device();
    const laptop = await device();
    await getOrCreateWeek(phone, WEEK);
    await syncOnce(phone, server.api);
    await syncOnce(laptop, server.api);

    const p = await lunch(phone);
    if (!p) throw new Error("falta la porción");
    await actOnPortion(phone, p.id, "pack");
    await setInventory(phone, "huevo", 7);
    await syncOnce(phone, server.api);
    await syncOnce(laptop, server.api);

    expect((await laptop.portions.get(p.id))?.state).toBe("packed");
    expect((await laptop.inventory.get("huevo"))?.qty).toBe(7);
  });

  it("un dispositivo nuevo adopta los datos de la cuenta en vez de pisarlos", async () => {
    const server = fakeServer();
    const phone = await device();
    await updateSettings(phone, { coldPacks: 2 });
    await syncOnce(phone, server.api);

    const laptop = await device(); // recién instalado: ajustes por defecto (coldPacks 0)
    await syncOnce(laptop, server.api);
    expect((await laptop.settings.get("default"))?.coldPacks).toBe(2);
  });

  it("una porción comida no vuelve atrás aunque otro dispositivo mande un estado viejo", async () => {
    const server = fakeServer();
    const phone = await device();
    const laptop = await device();
    await getOrCreateWeek(phone, WEEK);
    await syncOnce(phone, server.api);
    await syncOnce(laptop, server.api);
    const p = await lunch(phone);
    if (!p) throw new Error("falta la porción");

    await actOnPortion(phone, p.id, "eat");
    await syncOnce(phone, server.api);
    // La laptop, sin sincronizar, la marca como empacada (estado menos avanzado).
    await actOnPortion(laptop, p.id, "pack");
    await syncOnce(laptop, server.api);

    expect((await laptop.portions.get(p.id))?.state).toBe("eaten");
  });

  it("los cambios que llegan del servidor no se reenvían (sin eco)", async () => {
    const server = fakeServer();
    const phone = await device();
    const laptop = await device();
    await setInventory(phone, "arroz", 1000);
    await syncOnce(phone, server.api);
    await syncOnce(laptop, server.api);
    expect(await pendingCount(laptop)).toBe(0);
  });

  it("enlazar un dispositivo borra lo anotado antes de iniciar sesión", async () => {
    const server = fakeServer();
    const phone = await device();
    await syncOnce(phone, server.api);
    const laptop = await device();
    await setInventory(laptop, "pan", 3);
    await linkDevice(laptop, server.api);
    // "pan" no estaba en el servidor: se sube una vez.
    expect(server.docs.get("inventory|pan")).toBeDefined();
    expect(await pendingCount(laptop)).toBe(0);
  });
});

describe("transformaciones", () => {
  it("el token de Todoist no sale del dispositivo y se conserva al recibir ajustes", () => {
    const local = {
      id: "default",
      todoist: { token: "secreto", projectId: "p" },
    };
    const out = toRemote("settings", local);
    expect(JSON.stringify(out)).not.toContain("secreto");
    const back = fromRemote(
      "settings",
      { id: "default", todoist: { projectId: "p2" } },
      local,
    );
    expect(back).toEqual({
      id: "default",
      todoist: { projectId: "p2", token: "secreto" },
    });
  });
});
