"use client";

import type { ISODate } from "@app/domain/dates";
import { calendarApi } from "@app/integrations/google/api";
import {
  disconnectGoogle,
  GOOGLE_CLIENT_ID,
  getAccessToken,
  hasValidToken,
  loadGis,
} from "@app/integrations/google/gis";
import { useCallback, useEffect, useState } from "react";
import { getDB } from "./db";
import {
  type CalendarRole,
  type DiscoveredCalendar,
  discoverCalendars,
  pullWeeks,
  pushWeek,
} from "./google-sync";
import { updateSettings } from "./repo";

type Busy = "connect" | "save" | "pull" | "push" | null;

/** Conexión con Google Calendar: conectar, elegir calendarios, traer y enviar. */
export function useGoogleCalendar() {
  const configured = GOOGLE_CLIENT_ID !== "";
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<DiscoveredCalendar[] | null>(null);
  const [connected, setConnected] = useState(false);

  // Precarga el script para que el popup abra dentro del toque del usuario.
  useEffect(() => {
    if (configured) loadGis().catch(() => undefined);
    setConnected(hasValidToken());
  }, [configured]);

  const run = useCallback(
    async (
      kind: Exclude<Busy, null>,
      fn: () => Promise<string | undefined>,
    ) => {
      setBusy(kind);
      setError(null);
      setMessage(null);
      try {
        const msg = await fn();
        if (msg) setMessage(msg);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
        setConnected(hasValidToken());
      }
    },
    [],
  );

  const api = async () =>
    calendarApi(await getAccessToken({ interactive: true }));

  const connect = () =>
    run("connect", async () => {
      setCalendars(await discoverCalendars(await api()));
      return undefined;
    });

  const saveRoles = (roles: Record<string, CalendarRole>) =>
    run("save", async () => {
      const db = getDB();
      const current = (await db.settings.get("default"))?.google;
      const ids = (role: CalendarRole) =>
        Object.entries(roles)
          .filter(([, r]) => r === role)
          .map(([id]) => id);
      await updateSettings(db, {
        google: {
          ...current,
          fixedCalendarIds: ids("fixed"),
          flexibleCalendarIds: ids("flexible"),
        },
      });
      setCalendars(null);
      return "Calendarios guardados.";
    });

  const pull = (weekStarts: ISODate[]) =>
    run("pull", async () => {
      const { events } = await pullWeeks(getDB(), await api(), weekStarts);
      return `Horario actualizado: ${events} eventos. La semana se recalculó conservando lo ya cocinado.`;
    });

  const push = (weekStart: ISODate) =>
    run("push", async () => {
      const r = await pushWeek(getDB(), await api(), weekStart);
      return r.created + r.updated + r.removed === 0
        ? "Calendar ya estaba al día."
        : `Calendar actualizado: ${r.created} nuevos, ${r.updated} cambiados, ${r.removed} borrados.`;
    });

  const disconnect = () => {
    disconnectGoogle();
    setConnected(false);
    setCalendars(null);
    setMessage("Desconectado. Tus datos locales siguen aquí.");
  };

  return {
    configured,
    connected,
    busy,
    error,
    message,
    calendars,
    connect,
    saveRoles,
    pull,
    push,
    disconnect,
  };
}
