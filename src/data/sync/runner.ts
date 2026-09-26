"use client";

import { todayIn } from "@app/domain/dates";
import { API_CONFIGURED, ApiError } from "@app/integrations/backend/api";
import { getDB } from "../db";
import { backend, getSession } from "../session";
import { syncOnce } from "./engine";
import { pushReminders } from "./reminders";

export interface SyncStatus {
  state: "idle" | "syncing" | "error" | "offline";
  error: string | null;
}

let status: SyncStatus = { state: "idle", error: null };
const listeners = new Set<() => void>();

function set(next: SyncStatus) {
  status = next;
  for (const l of listeners) l();
}

export const getSyncStatus = () => status;
export function subscribeSyncStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Un ciclo completo: datos (push → pull) y luego avisos. No hace nada sin sesión. */
export async function runSync(): Promise<void> {
  if (!API_CONFIGURED) return;
  const db = getDB();
  if (!(await getSession(db))) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    set({ state: "offline", error: null });
    return;
  }
  set({ state: "syncing", error: null });
  try {
    const api = backend(db);
    await syncOnce(db, api);
    const tz = (await db.settings.get("default"))?.timeZone ?? "America/Lima";
    await pushReminders(db, api, todayIn(tz), tz);
    set({ state: "idle", error: null });
  } catch (e) {
    if (e instanceof ApiError && e.status === 0)
      set({ state: "offline", error: null });
    else
      set({
        state: "error",
        error: e instanceof Error ? e.message : String(e),
      });
  }
}
