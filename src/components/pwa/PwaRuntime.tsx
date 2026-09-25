"use client";

import { getDB } from "@app/data/db";
import { useToday } from "@app/data/hooks";
import { timersOn } from "@app/data/repo";
import { ring } from "@app/lib/device";
import {
  captureInstallPrompt,
  isStandalone,
  notify,
  persistStorage,
  SW_ENABLED,
} from "@app/lib/pwa";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Registra el service worker y ofrece recargar cuando hay una versión nueva. */
function useServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!SW_ENABLED || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller)
          setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            // "installed" con un controlador activo = hay versión nueva esperando.
            if (sw.state === "installed" && navigator.serviceWorker.controller)
              setWaiting(sw);
          });
        });
      })
      .catch(() => undefined);

    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
  }, []);

  return { waiting, update: () => waiting?.postMessage("SKIP_WAITING") };
}

/**
 * Avisa cuando termina un temporizador de cocina, esté donde esté el usuario en la app
 * (y con la pestaña en segundo plano si dio permiso de avisos).
 */
function TimerWatcher() {
  const today = useToday();
  const timers = useLiveQuery(
    () => (today ? timersOn(getDB(), today) : Promise.resolve([])),
    [today],
  );
  const components = useLiveQuery(() => getDB().components.toArray(), []);
  const alerted = useRef(new Set<string>());

  useEffect(() => {
    if (!timers || !components) return;
    const handles: number[] = [];
    for (const t of timers) {
      const key = `${t.prepId}:${t.stepId}:${t.minutes}:${t.startedAt}`;
      if (alerted.current.has(key)) continue;
      const endsAt = t.startedAt + t.minutes * 60_000;
      const [compId, rest] = t.stepId.split(":");
      const comp = components.find((c) => c.id === compId);
      const task = comp?.tasks.find((x) => x.id === rest?.split("#")[0]);
      const fire = () => {
        if (alerted.current.has(key)) return;
        alerted.current.add(key);
        ring();
        void notify(
          `Listo: ${comp?.name ?? "temporizador"}`,
          task ? `${task.label} · ${t.minutes} min` : `${t.minutes} min`,
        );
      };
      const wait = endsAt - Date.now();
      // Los que terminaron hace más de 2 min (p. ej. al reabrir la app) no suenan.
      if (wait <= 0) {
        if (wait > -2 * 60_000) fire();
        else alerted.current.add(key);
      } else {
        handles.push(window.setTimeout(fire, wait));
      }
    }
    return () => {
      for (const h of handles) window.clearTimeout(h);
    };
  }, [timers, components]);

  return null;
}

export function PwaRuntime() {
  const { waiting, update } = useServiceWorker();

  useEffect(() => captureInstallPrompt(), []);
  useEffect(() => {
    // Instalada = el usuario la quiere a largo plazo: que el navegador no borre sus datos.
    if (isStandalone()) void persistStorage();
  }, []);

  return (
    <>
      <TimerWatcher />
      <AnimatePresence>
        {waiting && (
          <motion.div
            role="status"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[max(env(safe-area-inset-top),12px)]"
          >
            <div className="flex items-center gap-3 rounded-full bg-text py-2 pr-2 pl-4 text-sm text-bg shadow-lg">
              Hay una versión nueva
              <button
                type="button"
                onClick={update}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 font-semibold text-panel"
              >
                <ArrowsClockwise size={14} weight="bold" aria-hidden />
                Actualizar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
