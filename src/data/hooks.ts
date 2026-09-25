"use client";

import { type ISODate, minutesIn, todayIn } from "@app/domain/dates";
import type { PortionAction } from "@app/domain/safety";
import type { ScheduleEvent, Settings, WeekPlan } from "@app/domain/types";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import { getDB } from "./db";
import {
  actOnPortion,
  boughtFor,
  checksFor,
  cookState,
  getOrCreateWeek,
  inventoryMap,
  type LoadedData,
  loadData,
  readWeek,
  regenerateWeek,
  resetCook,
  seedIfEmpty,
  setBought,
  setCheck,
  setInventory,
  timerKey,
  updateSettings,
  weekEvents,
} from "./repo";

export interface WeekData extends LoadedData {
  plan: WeekPlan;
  events: ScheduleEvent[];
}

/**
 * Fecha civil de hoy. Es null en el primer render (servidor e hidratación) para no
 * desincronizar el HTML cuando el servidor y el teléfono están en días distintos.
 */
export function useToday(timeZone = "America/Lima"): ISODate | null {
  const [today, setToday] = useState<ISODate | null>(null);
  useEffect(() => {
    setToday(todayIn(timeZone));
  }, [timeZone]);
  return today;
}

/** Asegura que la semana exista y la mantiene sincronizada con IndexedDB. */
export function useWeek(weekStart: ISODate | null) {
  const [ensured, setEnsured] = useState<ISODate | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    let cancelled = false;
    const db = getDB();
    (async () => {
      await seedIfEmpty(db);
      await getOrCreateWeek(db, weekStart);
      if (!cancelled) setEnsured(weekStart);
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const data = useLiveQuery(async (): Promise<WeekData | undefined> => {
    if (!weekStart || ensured !== weekStart) return undefined;
    const db = getDB();
    const [plan, loaded, events] = await Promise.all([
      readWeek(db, weekStart),
      loadData(db),
      weekEvents(db, weekStart),
    ]);
    return plan && { ...loaded, plan, events };
  }, [weekStart, ensured]);

  const regenerate = useCallback(async () => {
    if (weekStart) await regenerateWeek(getDB(), weekStart);
  }, [weekStart]);

  return { data, error, regenerate };
}

/** Minutos desde medianoche, actualizados cada minuto. Null hasta montar en el cliente. */
export function useNow(timeZone = "America/Lima"): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(minutesIn(timeZone));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timeZone]);
  return now;
}

/** Casillas marcadas del día (reactivo) y cómo cambiarlas. */
export function useDayChecks(date: ISODate | null) {
  const checks = useLiveQuery(
    () =>
      date ? checksFor(getDB(), date) : Promise.resolve(new Set<string>()),
    [date],
  );
  const toggle = useCallback(
    (key: string, checked: boolean) => {
      if (date) void setCheck(getDB(), date, key, checked);
    },
    [date],
  );
  return { checks: checks ?? new Set<string>(), toggle };
}

export function usePortionAction() {
  return useCallback(
    (portionId: string, action: PortionAction) =>
      actOnPortion(getDB(), portionId, action),
    [],
  );
}

/** Compras marcadas de la semana e inventario de casa (ambos reactivos). */
export function useShopping(weekStart: ISODate | null) {
  const bought = useLiveQuery(
    () =>
      weekStart
        ? boughtFor(getDB(), weekStart)
        : Promise.resolve(new Set<string>()),
    [weekStart],
  );
  const inventory = useLiveQuery(() => inventoryMap(getDB()), []);
  const toggleBought = useCallback(
    (key: string, checked: boolean) => {
      if (weekStart) void setBought(getDB(), weekStart, key, checked);
    },
    [weekStart],
  );
  const setHave = useCallback((ingredientId: string, qty: number) => {
    void setInventory(getDB(), ingredientId, qty);
  }, []);
  return {
    bought: bought ?? new Set<string>(),
    inventory: inventory ?? new Map<string, number>(),
    ready: bought !== undefined && inventory !== undefined,
    toggleBought,
    setHave,
  };
}

export function useUpdateSettings() {
  return useCallback(
    (patch: Partial<Omit<Settings, "id">>) => updateSettings(getDB(), patch),
    [],
  );
}

/** Sesión de cocina en curso: inicio, pasos hechos y minutos transcurridos (tic cada 20 s). */
export function useCook(date: ISODate | null, prepId: string | null) {
  const state = useLiveQuery(
    () =>
      date && prepId
        ? cookState(getDB(), date, prepId)
        : Promise.resolve({
            startedAt: null,
            done: new Set<string>(),
            timers: [],
          }),
    [date, prepId],
  );
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);

  const start = useCallback(() => {
    if (date && prepId)
      void setCheck(getDB(), date, `cook:${prepId}:start`, true);
  }, [date, prepId]);
  const reset = useCallback(() => {
    if (date && prepId) void resetCook(getDB(), date, prepId);
  }, [date, prepId]);
  const toggle = useCallback(
    (stepKey: string, checked: boolean) => {
      if (date && prepId)
        void setCheck(getDB(), date, `cook:${prepId}:${stepKey}`, checked);
    },
    [date, prepId],
  );

  const setTimer = useCallback(
    (stepId: string, minutes: number, on: boolean) => {
      if (date && prepId)
        void setCheck(
          getDB(),
          date,
          `cook:${prepId}:${timerKey(stepId, minutes)}`,
          on,
        );
    },
    [date, prepId],
  );

  const startedAt = state?.startedAt ?? null;
  const elapsedMin =
    startedAt && nowMs !== null
      ? Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / 60_000))
      : null;
  return {
    ready: state !== undefined,
    startedAt,
    elapsedMin,
    done: state?.done ?? new Set<string>(),
    timers: state?.timers ?? [],
    nowMs,
    setTimer,
    start,
    reset,
    toggle,
  };
}
