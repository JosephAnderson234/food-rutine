"use client";

import type { InventoryUpdate, WeekBlocks, WeekContext } from "@app/domain/ai";
import type { ISODate } from "@app/domain/dates";
import type { Ingredient, ScheduleEvent } from "@app/domain/types";
import { useCallback, useState } from "react";
import { getDB } from "./db";
import { addManualEvents, removeManualEvent, setInventory } from "./repo";

type AiRequest =
  | { kind: "week"; text: string; context: WeekContext }
  | {
      kind: "inventory";
      text: string;
      ingredients: Pick<Ingredient, "id" | "name" | "unit">[];
    };

async function callAi<T>(body: AiRequest): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "Sin conexión: el asistente necesita internet. Lo demás sigue funcionando.",
    );
  }
  const json = (await res.json().catch(() => ({}))) as {
    output?: T;
    error?: string;
  };
  if (!res.ok || !json.output)
    throw new Error(json.error ?? "El asistente no respondió.");
  return json.output;
}

/** Asistente (Groq): propone; nada se guarda hasta que el usuario confirma. */
export function useAi() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async <T>(body: AiRequest): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await callAi<T>(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const askWeek = (context: WeekContext, text: string) =>
    ask<WeekBlocks>({ kind: "week", text, context });

  const askInventory = (
    ingredients: Pick<Ingredient, "id" | "name" | "unit">[],
    text: string,
  ) => ask<InventoryUpdate>({ kind: "inventory", text, ingredients });

  return {
    busy,
    error,
    askWeek,
    askInventory,
    clearError: () => setError(null),
  };
}

export const applyBlocks = (weekStart: ISODate, events: ScheduleEvent[]) =>
  addManualEvents(getDB(), weekStart, events);

export const removeBlock = (weekStart: ISODate, id: string) =>
  removeManualEvent(getDB(), weekStart, id);

export async function applyInventory(
  changes: { ingredientId: string; after: number }[],
) {
  const db = getDB();
  for (const c of changes) await setInventory(db, c.ingredientId, c.after);
}
