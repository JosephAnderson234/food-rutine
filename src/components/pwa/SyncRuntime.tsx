"use client";

import { runSync } from "@app/data/sync/runner";
import { onLocalChange } from "@app/data/sync/tracking";
import { useEffect } from "react";

const DEBOUNCE_MS = 3_000;
const MIN_GAP_MS = 15_000;
const PERIODIC_MS = 2 * 60_000;

/**
 * Sincroniza sin que el usuario lo piense: al abrir la app, al volver a ella, al recuperar
 * internet, unos segundos después de cada cambio local y cada 2 min mientras está visible.
 * Sin sesión, `runSync` no hace nada.
 */
export function SyncRuntime() {
  useEffect(() => {
    let last = 0;
    let debounce: number | undefined;
    const now = () => Date.now();
    const soon = (force = false) => {
      if (!force && now() - last < MIN_GAP_MS) return;
      last = now();
      void runSync();
    };

    soon(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    const onOnline = () => soon(true);
    const offLocal = onLocalChange(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => soon(true), DEBOUNCE_MS);
    });
    const periodic = window.setInterval(() => {
      if (document.visibilityState === "visible") soon();
    }, PERIODIC_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      offLocal();
      window.clearTimeout(debounce);
      window.clearInterval(periodic);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
