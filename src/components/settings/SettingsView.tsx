"use client";

import type { CalendarRole, DiscoveredCalendar } from "@app/data/google-sync";
import { useToday, useWeek } from "@app/data/hooks";
import { useGoogleCalendar } from "@app/data/use-google";
import { addDays, startOfWeek } from "@app/domain/dates";
import {
  ArrowsClockwise,
  CalendarCheck,
  CaretLeft,
  CheckCircle,
  CloudArrowDown,
  CloudArrowUp,
  GoogleLogo,
  LockSimple,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

const ROLE_LABEL: Record<CalendarRole, string> = {
  fixed: "Fijo",
  flexible: "Flexible",
  ignore: "Ignorar",
};

const ROLE_HINT: Record<CalendarRole, string> = {
  fixed: "Cursos: no se mueven",
  flexible: "Bloquea horario",
  ignore: "No se lee",
};

function when(iso?: string): string {
  if (!iso) return "nunca";
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  }).format(new Date(iso));
}

function RolePicker({
  calendars,
  initial,
  saving,
  onSave,
}: {
  calendars: DiscoveredCalendar[];
  initial: Record<string, CalendarRole>;
  saving: boolean;
  onSave: (roles: Record<string, CalendarRole>) => void;
}) {
  const [roles, setRoles] = useState<Record<string, CalendarRole>>(() =>
    Object.fromEntries(
      calendars.map((c) => [c.id, initial[c.id] ?? c.suggested]),
    ),
  );
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {calendars.map((c) => (
          <li key={c.id} className="space-y-2 p-3">
            <p className="text-sm font-medium">
              {c.summary}
              {c.primary && (
                <span className="ml-1.5 text-xs text-muted">(principal)</span>
              )}
            </p>
            <fieldset className="grid grid-cols-3 gap-1 rounded-full bg-panel-2 p-1 text-xs">
              <legend className="sr-only">Rol de {c.summary}</legend>
              {(["fixed", "flexible", "ignore"] as const).map((r) => (
                <label
                  key={r}
                  className={`cursor-pointer rounded-full px-2 py-1.5 text-center font-medium has-focus-visible:ring-2 has-focus-visible:ring-accent ${
                    roles[c.id] === r ? "bg-text text-bg" : "text-muted"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`role-${c.id}`}
                    checked={roles[c.id] === r}
                    onChange={() =>
                      setRoles((prev) => ({ ...prev, [c.id]: r }))
                    }
                  />
                  {ROLE_LABEL[r]}
                </label>
              ))}
            </fieldset>
            <p className="text-[11px] text-muted">{ROLE_HINT[roles[c.id]]}</p>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(roles)}
        className="w-full rounded-full bg-accent py-3 font-semibold text-panel disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar calendarios"}
      </button>
    </div>
  );
}

export function SettingsView() {
  const today = useToday();
  const weekStart = today ? startOfWeek(today) : null;
  const { data } = useWeek(weekStart);
  const g = useGoogleCalendar();
  const google = data?.settings.google;
  const initialRoles: Record<string, CalendarRole> = Object.fromEntries([
    ...(google?.fixedCalendarIds ?? []).map((id) => [id, "fixed"] as const),
    ...(google?.flexibleCalendarIds ?? []).map(
      (id) => [id, "flexible"] as const,
    ),
  ]);
  const ready = Boolean(
    google &&
      (google.fixedCalendarIds.length || google.flexibleCalendarIds.length),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/semana"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
        >
          <CaretLeft size={14} weight="bold" aria-hidden />
          Semana
        </Link>
        <h1 className="text-5xl leading-[0.9] font-bold">Ajustes</h1>
      </header>

      <section className="space-y-4 rounded-3xl border border-line bg-panel p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-panel-2">
            <GoogleLogo size={22} weight="bold" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">Google Calendar</h2>
            <p className="text-sm text-muted">
              Lee tus cursos y eventos para planificar; escribe gym, meal prep y
              recordatorios en un calendario aparte llamado «Meal Prep».
            </p>
          </div>
          {g.connected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">
              <CheckCircle size={12} weight="fill" aria-hidden />
              Conectado
            </span>
          )}
        </div>

        {!g.configured ? (
          <div className="space-y-2 rounded-2xl bg-warn-soft p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <WarningCircle
                size={16}
                weight="duotone"
                className="text-warn"
                aria-hidden
              />
              Falta configurar las credenciales
            </p>
            <p>
              Crea el cliente OAuth siguiendo{" "}
              <code className="font-mono text-xs">docs/GOOGLE_SETUP.md</code> y
              agrega{" "}
              <code className="font-mono text-xs">
                NEXT_PUBLIC_GOOGLE_CLIENT_ID
              </code>{" "}
              en <code className="font-mono text-xs">.env.local</code>. Luego
              reinicia el servidor.
            </p>
          </div>
        ) : g.calendars ? (
          <RolePicker
            calendars={g.calendars}
            initial={initialRoles}
            saving={g.busy === "save"}
            onSave={g.saveRoles}
          />
        ) : (
          <div className="space-y-3">
            {!ready && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={g.connect}
                disabled={g.busy !== null}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-text py-3 font-semibold text-bg disabled:opacity-50"
              >
                <GoogleLogo size={18} weight="bold" aria-hidden />
                {g.busy === "connect" ? "Conectando…" : "Conectar con Google"}
              </motion.button>
            )}

            {ready && weekStart && (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    disabled={g.busy !== null}
                    onClick={() => g.pull([weekStart, addDays(weekStart, 7)])}
                    className="flex items-center justify-center gap-2 rounded-full border border-line bg-panel-2 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    <CloudArrowDown size={18} weight="duotone" aria-hidden />
                    {g.busy === "pull" ? "Trayendo…" : "Traer horario"}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    disabled={g.busy !== null}
                    onClick={() => g.push(weekStart)}
                    className="flex items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-panel disabled:opacity-50"
                  >
                    <CloudArrowUp size={18} weight="duotone" aria-hidden />
                    {g.busy === "push"
                      ? "Enviando…"
                      : "Enviar semana a Calendar"}
                  </motion.button>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs text-muted">
                  <div>
                    <dt>Último horario traído</dt>
                    <dd className="font-mono text-text">
                      {when(google?.lastPullAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Último envío</dt>
                    <dd className="font-mono text-text">
                      {when(google?.lastPushAt)}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    onClick={g.connect}
                    disabled={g.busy !== null}
                    className="inline-flex items-center gap-1 text-muted hover:text-text"
                  >
                    <CalendarCheck size={14} weight="duotone" aria-hidden />
                    Cambiar calendarios
                  </button>
                  {g.connected && (
                    <button
                      type="button"
                      onClick={g.disconnect}
                      className="inline-flex items-center gap-1 text-muted hover:text-danger"
                    >
                      <SignOut size={14} weight="duotone" aria-hidden />
                      Desconectar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {g.busy && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ArrowsClockwise size={14} className="animate-spin" aria-hidden />
            Hablando con Google…
          </p>
        )}
        {g.message && (
          <output className="block rounded-2xl bg-good-soft p-3 text-sm">
            {g.message}
          </output>
        )}
        {g.error && (
          <p role="alert" className="rounded-2xl bg-danger-soft p-3 text-sm">
            {g.error}
          </p>
        )}

        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <LockSimple
            size={14}
            weight="duotone"
            className="mt-px shrink-0"
            aria-hidden
          />
          La app solo puede leer tus calendarios y escribir en el que ella misma
          crea. El permiso vive en esta pestaña (~1 h) y no sale de tu
          navegador.
        </p>
      </section>
    </div>
  );
}
