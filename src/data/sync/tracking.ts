import type {
  DBCore,
  DBCoreMutateRequest,
  DBCoreMutateResponse,
  DBCoreTable,
  DBCoreTransaction,
  Middleware,
} from "dexie";

/** Tablas de IndexedDB que se sincronizan con el backend (mismo nombre de colección). */
export const SYNCED_TABLES = [
  "settings",
  "weeks",
  "portions",
  "checks",
  "inventory",
  "manualEvents",
  "shoppingChecks",
  "calendarCache",
  "todoSent",
  "ingredients",
  "components",
  "assemblies",
  "weekTemplates",
  "fixedCourses",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const OUTBOX = "outbox";

/** Cambio local pendiente de enviar. `docId: "*"` = hay que reenviar la tabla entera. */
export interface OutboxEntry {
  seq?: number;
  collection: SyncedTable;
  docId: string;
  at: string;
}

const tracked = new Set<string>(SYNCED_TABLES);

/** Transacciones que aplican cambios que vienen del servidor: no se vuelven a anotar. */
const remoteTransactions = new WeakSet<object>();
export function markRemote(trans: object): void {
  remoteTransactions.add(trans);
}

type Listener = () => void;
const listeners = new Set<Listener>();
/** Avisa cuando hay cambios locales nuevos (para sincronizar con un pequeño retraso). */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function keysOf(
  req: DBCoreMutateRequest,
  res: DBCoreMutateResponse,
): string[] | "*" {
  switch (req.type) {
    case "add":
    case "put":
      // Con `criteria` (modify sobre un rango) no siempre hay claves: se reenvía la tabla.
      if (res.results?.length) return res.results.map(String);
      if (req.keys?.length) return req.keys.map(String);
      return req.values.length === 0 && !(req.type === "put" && req.criteria)
        ? []
        : "*";
    case "delete":
      return req.keys.map(String);
    case "deleteRange":
      return "*";
  }
}

/**
 * Middleware de Dexie: toda escritura en una tabla sincronizada deja una entrada en el
 * outbox dentro de la MISMA transacción (si la escritura se deshace, la entrada también).
 */
export const syncTracking: Middleware<DBCore> = {
  stack: "dbcore",
  name: "sync-tracking",
  create(down) {
    return {
      ...down,
      transaction(stores, mode, options) {
        const needsOutbox =
          mode === "readwrite" &&
          stores.some((s) => tracked.has(s)) &&
          !stores.includes(OUTBOX);
        return down.transaction(
          needsOutbox ? [...stores, OUTBOX] : stores,
          mode,
          options,
        );
      },
      table(name): DBCoreTable {
        const table = down.table(name);
        if (!tracked.has(name)) return table;
        return {
          ...table,
          async mutate(req) {
            const res = await table.mutate(req);
            if (remoteTransactions.has(req.trans as DBCoreTransaction))
              return res;
            // Migraciones de esquema: el outbox puede no existir todavía y no son cambios del usuario.
            if ((req.trans as { mode?: string }).mode === "versionchange")
              return res;
            const keys = keysOf(req, res);
            if (keys !== "*" && keys.length === 0) return res;
            const at = new Date().toISOString();
            const values: OutboxEntry[] = (keys === "*" ? ["*"] : keys).map(
              (docId) => ({
                collection: name as SyncedTable,
                docId,
                at,
              }),
            );
            await down
              .table(OUTBOX)
              .mutate({ type: "add", trans: req.trans, values });
            queueMicrotask(() => {
              for (const l of listeners) l();
            });
            return res;
          },
        };
      },
    };
  },
};
