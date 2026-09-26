"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState, useSyncExternalStore } from "react";
import { getDB } from "./db";
import { getSession, signIn, signOut } from "./session";
import { lastSyncAt, pendingCount } from "./sync/engine";
import { getSyncStatus, runSync, subscribeSyncStatus } from "./sync/runner";

const SERVER_STATUS = { state: "idle", error: null } as const;

/** Cuenta (login con Google en el backend) y estado de la sincronización. */
export function useAccount() {
  const session = useLiveQuery(
    async () => (await getSession(getDB())) ?? null,
    [],
  );
  const lastSync = useLiveQuery(() => lastSyncAt(getDB()), []);
  const pending = useLiveQuery(() => pendingCount(getDB()), []);
  const sync = useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    () => SERVER_STATUS,
  );
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithCredential = useCallback(async (credential: string) => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn(getDB(), credential);
      await runSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningIn(false);
    }
  }, []);

  return {
    ready: session !== undefined,
    session: session ?? null,
    lastSync: lastSync ?? null,
    pending: pending ?? 0,
    sync,
    signingIn,
    error,
    signInWithCredential,
    signOut: () => signOut(getDB()),
    syncNow: runSync,
  };
}
