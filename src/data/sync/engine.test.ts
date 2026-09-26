import "fake-indexeddb/auto";
import type {
  AuthedApi,
  PulledChange,
  RemoteChange,
} from "@app/integrations/backend/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("enlazar un dispositivo sube lo anotado antes de iniciar sesión", async () => {
    const server = fakeServer();
    const phone = await device();
    await syncOnce(phone, server.api);
    const laptop = await device();
    await setInventory(laptop, "pan", 3);
    await linkDevice(laptop, server.api);
    expect(server.docs.get("inventory|pan")).toBeDefined();
    expect(await pendingCount(laptop)).toBe(0);
  });
});

describe("enlace: el orden de inicio de sesión no importa", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const at = (iso: string) => vi.setSystemTime(new Date(iso));
  const qty = async (db: MealPrepDB, id: string) =>
    (await db.inventory.get(id))?.qty;

  it("un dispositivo nuevo que entra primero no pisa tus datos reales", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeServer();
    at("2026-09-20T10:00:00Z");
    const real = await device();
    await setInventory(real, "arroz", 5);
    await updateSettings(real, { coldPacks: 2 }); // pisa un documento de ejemplo
    at("2026-09-25T10:00:00Z");
    const fresh = await device(); // datos de ejemplo, sin tocar
    await linkDevice(fresh, server.api);
    await linkDevice(real, server.api);
    await syncOnce(fresh, server.api);
    for (const db of [real, fresh]) {
      expect(await qty(db, "arroz")).toBe(5);
      expect((await db.settings.get("default"))?.coldPacks).toBe(2);
    }
  });

  it("si tu dispositivo real entra primero, el nuevo adopta la cuenta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeServer();
    at("2026-09-20T10:00:00Z");
    const real = await device();
    await setInventory(real, "arroz", 5);
    await linkDevice(real, server.api);
    at("2026-09-25T10:00:00Z");
    const fresh = await device();
    await linkDevice(fresh, server.api);
    expect(await qty(fresh, "arroz")).toBe(5);
  });

  it("cambios en documentos distintos de ambos lados se conservan", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeServer();
    at("2026-09-20T10:00:00Z");
    const a = await device();
    const b = await device();
    await setInventory(a, "arroz", 5);
    at("2026-09-20T11:00:00Z");
    await setInventory(b, "pan", 2);
    await linkDevice(a, server.api);
    await linkDevice(b, server.api);
    await syncOnce(a, server.api);
    for (const db of [a, b]) {
      expect(await qty(db, "arroz")).toBe(5);
      expect(await qty(db, "pan")).toBe(2);
    }
  });

  it("el mismo documento editado en ambos antes del login: gana el más reciente", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeServer();
    at("2026-09-20T10:00:00Z");
    const a = await device();
    const b = await device();
    await setInventory(b, "arroz", 1);
    at("2026-09-20T12:00:00Z");
    await setInventory(a, "arroz", 7);
    // El más antiguo entra después: igual pierde.
    await linkDevice(a, server.api);
    await linkDevice(b, server.api);
    await syncOnce(a, server.api);
    expect(await qty(a, "arroz")).toBe(7);
    expect(await qty(b, "arroz")).toBe(7);
  });
});

describe("token de Todoist", () => {
  it("el token guardado antes del login llega a la cuenta aunque sus ajustes sean más nuevos", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const server = fakeServer();
    vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    const laptop = await device();
    await updateSettings(laptop, { todoist: { token: "tok_local" } });
    vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
    const phone = await device();
    await updateSettings(phone, { coldPacks: 3 }); // ajustes más nuevos, sin token
    await linkDevice(phone, server.api);
    vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
    await linkDevice(laptop, server.api);
    await syncOnce(phone, server.api);
    for (const db of [laptop, phone]) {
      const s = await db.settings.get("default");
      expect(s?.todoist?.token).toBe("tok_local");
      expect(s?.coldPacks).toBe(3);
    }
    vi.useRealTimers();
  });

  it("viaja con los ajustes (el backend lo cifra)", () => {
    const local = { id: "default", todoist: { token: "tok", projectId: "p" } };
    expect(toRemote("settings", local)).toEqual(local);
  });

  it("al recibir, manda el token de la cuenta", () => {
    const back = fromRemote(
      "settings",
      { id: "default", todoist: { token: "de-la-cuenta" } },
      { id: "default", todoist: { token: "viejo" } },
    );
    expect((back.todoist as { token: string }).token).toBe("de-la-cuenta");
  });

  it("si la cuenta no tiene token, conserva el del dispositivo", () => {
    const back = fromRemote(
      "settings",
      { id: "default", todoist: { projectId: "p2" } },
      { id: "default", todoist: { token: "local" } },
    );
    expect(back).toEqual({
      id: "default",
      todoist: { projectId: "p2", token: "local" },
    });
  });

  it("se sincroniza entre dispositivos", async () => {
    const server = fakeServer();
    const phone = await device();
    await syncOnce(phone, server.api);
    const laptop = await device();
    await syncOnce(laptop, server.api);
    await updateSettings(laptop, { todoist: { token: "tok_laptop" } });
    await syncOnce(laptop, server.api);
    await syncOnce(phone, server.api);
    expect((await phone.settings.get("default"))?.todoist?.token).toBe(
      "tok_laptop",
    );
  });
});
