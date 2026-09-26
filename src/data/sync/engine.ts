import type {
  AuthedApi,
  PulledChange,
  RemoteChange,
} from "@app/integrations/backend/api";
import type { MealPrepDB } from "../db";
import {
  markRemote,
  type OutboxEntry,
  SYNCED_TABLES,
  type SyncedTable,
} from "./tracking";

const BATCH = 500;
const synced = new Set<string>(SYNCED_TABLES);

// ── Transformaciones por colección ──────────────────────────────────────────

type Doc = Record<string, unknown>;

/**
 * Lo que sale del dispositivo. El token de Todoist viaja con los ajustes (por HTTPS) y el
 * backend lo guarda cifrado, así tu cuenta lo lleva a todos tus dispositivos.
 */
export function toRemote(_collection: SyncedTable, row: Doc): Doc {
  return row;
}

/**
 * Lo que llega: manda el token de la cuenta; si la cuenta no tiene uno (ajustes subidos
 * antes de sincronizar tokens), se conserva el de este dispositivo.
 */
export function fromRemote(
  collection: SyncedTable,
  data: Doc,
  local: Doc | undefined,
): Doc {
  if (collection === "settings") {
    const remoteToken = (data.todoist as Doc | undefined)?.token;
    const localToken = (local?.todoist as Doc | undefined)?.token;
    if (!remoteToken && localToken)
      return {
        ...data,
        todoist: { ...((data.todoist as Doc) ?? {}), token: localToken },
      };
  }
  return data;
}

const keyOf = (collection: string, docId: string) =>
  `${collection}\u0000${docId}`;

// ── Meta (cursor, vinculado, última sincronización) ─────────────────────────

async function meta(db: MealPrepDB, key: string): Promise<string | undefined> {
  return (await db.meta.get(key))?.value;
}
const setMeta = (db: MealPrepDB, key: string, value: string) =>
  db.meta.put({ key, value });

// ── Push ────────────────────────────────────────────────────────────────────

/** Envía lo pendiente del outbox. Devuelve cuántos documentos se enviaron. */
export async function pushOutbox(
  db: MealPrepDB,
  api: Pick<AuthedApi, "push">,
): Promise<number> {
  const entries = await db.outbox.orderBy("seq").limit(5000).toArray();
  if (entries.length === 0) return 0;
  const maxSeq = entries.at(-1)?.seq ?? 0;

  // Último cambio por documento; "*" se expande a toda la tabla.
  const latest = new Map<string, OutboxEntry>();
  for (const e of entries) {
    if (e.docId === "*") {
      const keys = await db.table(e.collection).toCollection().primaryKeys();
      for (const k of keys)
        latest.set(keyOf(e.collection, String(k)), { ...e, docId: String(k) });
    } else {
      latest.set(keyOf(e.collection, e.docId), e);
    }
  }

  const changes: RemoteChange[] = [];
  for (const e of latest.values()) {
    const row = (await db.table(e.collection).get(e.docId)) as Doc | undefined;
    changes.push({
      collection: e.collection,
      docId: e.docId,
      data: row ? toRemote(e.collection, row) : null,
      clientUpdatedAt: e.at,
    });
  }
  for (let i = 0; i < changes.length; i += BATCH) {
    await api.push(changes.slice(i, i + BATCH));
  }
  // Solo lo enviado: lo que se anotó mientras tanto queda para la próxima vuelta.
  await db.outbox.where("seq").belowOrEqual(maxSeq).delete();
  return changes.length;
}

// ── Pull ────────────────────────────────────────────────────────────────────

/** Aplica cambios del servidor sin volver a anotarlos; respeta lo local aún no enviado. */
async function applyRemote(
  db: MealPrepDB,
  changes: PulledChange[],
): Promise<Set<string>> {
  const seen = new Set<string>();
  const valid = changes.filter((c) => synced.has(c.collection));
  if (valid.length === 0) return seen;
  const pending = new Set(
    (await db.outbox.toArray()).map((e) => keyOf(e.collection, e.docId)),
  );
  const tables = [...new Set(valid.map((c) => c.collection))].map((n) =>
    db.table(n),
  );
  await db.transaction("rw", tables, async (tx) => {
    markRemote(tx.idbtrans);
    for (const c of valid) {
      const key = keyOf(c.collection, c.docId);
      seen.add(key);
      if (pending.has(key)) continue;
      const table = db.table(c.collection);
      if (c.deleted || c.data === null) {
        await table.delete(c.docId);
      } else {
        const local = (await table.get(c.docId)) as Doc | undefined;
        await table.put(
          fromRemote(c.collection as SyncedTable, c.data as Doc, local),
        );
      }
    }
  });
  return seen;
}

/** Trae todo lo posterior al cursor guardado. Devuelve las claves recibidas. */
export async function pullChanges(
  db: MealPrepDB,
  api: Pick<AuthedApi, "pull">,
): Promise<Set<string>> {
  let cursor = (await meta(db, "cursor")) ?? "0";
  const seen = new Set<string>();
  for (;;) {
    const page = await api.pull(cursor, BATCH);
    for (const k of await applyRemote(db, page.changes)) seen.add(k);
    cursor = page.cursor;
    await setMeta(db, "cursor", cursor);
    if (!page.hasMore) break;
  }
  return seen;
}

// ── Primer enlace de un dispositivo ─────────────────────────────────────────

/**
 * Primera sincronización de este dispositivo:
 * - Si la cuenta ya tiene datos (de otro dispositivo), se adoptan; solo se suben
 *   los documentos locales que el servidor no tiene.
 * - Si la cuenta está vacía, se sube todo lo local.
 */
export async function linkDevice(
  db: MealPrepDB,
  api: Pick<AuthedApi, "push" | "pull">,
): Promise<void> {
  // Lo anotado antes de iniciar sesión (datos de ejemplo) no debe pisar la cuenta.
  await db.outbox.clear();
  await db.meta.delete("cursor");
  const onServer = await pullChanges(db, api);

  const now = new Date().toISOString();
  const missing: OutboxEntry[] = [];
  for (const name of SYNCED_TABLES) {
    for (const k of await db.table(name).toCollection().primaryKeys()) {
      if (!onServer.has(keyOf(name, String(k))))
        missing.push({ collection: name, docId: String(k), at: now });
    }
  }
  if (missing.length > 0) await db.outbox.bulkAdd(missing);
  await pushOutbox(db, api);
  await setMeta(db, "linked", "1");
}

// ── Ciclo completo ──────────────────────────────────────────────────────────

let running: Promise<void> | null = null;

/** push → pull (o enlace inicial). Un solo ciclo a la vez. */
export function syncOnce(
  db: MealPrepDB,
  api: Pick<AuthedApi, "push" | "pull">,
): Promise<void> {
  running ??= (async () => {
    try {
      if ((await meta(db, "linked")) !== "1") await linkDevice(db, api);
      else {
        await pushOutbox(db, api);
        await pullChanges(db, api);
      }
      await setMeta(db, "lastSyncAt", new Date().toISOString());
    } finally {
      running = null;
    }
  })();
  return running;
}

export const lastSyncAt = (db: MealPrepDB) => meta(db, "lastSyncAt");
export const pendingCount = (db: MealPrepDB) => db.outbox.count();
