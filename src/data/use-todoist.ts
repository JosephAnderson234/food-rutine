"use client";

import type { ISODate } from "@app/domain/dates";
import { todoistApi } from "@app/integrations/todoist/api";
import { useCallback, useState } from "react";
import { getDB } from "./db";
import { updateSettings } from "./repo";
import { pushTodos } from "./todoist-sync";

type Busy = "save" | "push" | null;

/** Tareas cortas en Todoist: guardar token (se valida al guardarlo) y enviar la semana. */
export function useTodoist() {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const run = useCallback(
    async (kind: Exclude<Busy, null>, fn: () => Promise<string>) => {
      setBusy(kind);
      setError(null);
      setMessage(null);
      try {
        setMessage(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const saveToken = (token: string) =>
    run("save", async () => {
      const clean = token.trim();
      await todoistApi(clean).listProjects(); // valida el token antes de guardarlo
      await updateSettings(getDB(), { todoist: { token: clean } });
      return "Todoist conectado. Las tareas cortas ya no se enviarán al calendario.";
    });

  const push = (weekStart: ISODate) =>
    run("push", async () => {
      const db = getDB();
      const token = (await db.settings.get("default"))?.todoist?.token;
      if (!token) throw new Error("Primero guarda tu token de Todoist.");
      const r = await pushTodos(db, todoistApi(token), weekStart);
      const changes = r.created + r.updated + r.removed;
      return changes === 0
        ? "Todoist ya estaba al día."
        : `Todoist actualizado: ${r.created} nuevas, ${r.updated} cambiadas, ${r.removed} borradas.`;
    });

  const forget = () =>
    run("save", async () => {
      await updateSettings(getDB(), { todoist: undefined });
      return "Token borrado de este navegador.";
    });

  return { busy, error, message, saveToken, push, forget };
}
