"use client";

import { getDB } from "@app/data/db";
import { backend } from "@app/data/session";
import { useAccount } from "@app/data/use-account";
import { GOOGLE_CLIENT_ID, loadGis } from "@app/integrations/google/gis";
import {
  disablePush,
  enablePush,
  type PushState,
  pushState,
} from "@app/lib/push";
import {
  ArrowsClockwise,
  BellRinging,
  CheckCircle,
  CloudCheck,
  CloudSlash,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

function ago(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Botón oficial de Google (Sign in with Google): entrega el ID token para el backend. */
function GoogleButton({
  onCredential,
}: {
  onCredential: (credential: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        const id = window.google?.accounts.id;
        if (cancelled || !id || !ref.current) return;
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r) => onCredential(r.credential),
          cancel_on_tap_outside: true,
        });
        id.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          locale: "es",
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [onCredential]);
  if (failed)
    return (
      <p className="text-sm text-danger">
        No se pudo cargar Google (¿sin conexión?).
      </p>
    );
  return <div ref={ref} className="min-h-10" />;
}

function PushRow() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      const api = backend(getDB());
      setState(state === "on" ? await disablePush(api) : await enablePush(api));
    } finally {
      setBusy(false);
    }
  };
  const detail: Record<PushState, string> = {
    on: "Descongelar, lonchera, meal prep y temporizadores te avisan aunque la app esté cerrada.",
    off: "Actívalo para que los recordatorios lleguen con la app cerrada.",
    "no-sw":
      "Disponible en la app compilada/instalada (en `pnpm dev` no hay service worker).",
    denied:
      "El navegador bloqueó los avisos: actívalos en los permisos del sitio.",
    unsupported: "Este navegador no admite avisos push.",
  };
  if (!state) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-panel-2 p-3">
      <BellRinging
        size={20}
        weight="duotone"
        className="mt-0.5 shrink-0 text-accent"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Avisos con la app cerrada</p>
        <p className="text-xs text-muted">{detail[state]}</p>
      </div>
      {(state === "on" || state === "off") && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle()}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            state === "on" ? "border border-line bg-panel" : "bg-text text-bg"
          }`}
        >
          {busy ? "…" : state === "on" ? "Desactivar" : "Activar"}
        </button>
      )}
    </div>
  );
}

export function AccountSection() {
  const a = useAccount();
  if (!a.ready) return null;

  return (
    <section className="space-y-4 rounded-3xl border border-line bg-panel p-4">
      <div>
        <h2 className="text-xl font-semibold">Cuenta</h2>
        <p className="text-sm text-muted">
          Con tu cuenta, tus datos se sincronizan entre celular y laptop y los
          avisos llegan con la app cerrada. Sin cuenta, todo sigue funcionando
          solo en este dispositivo.
        </p>
      </div>

      {!a.session ? (
        <div className="space-y-2">
          {GOOGLE_CLIENT_ID ? (
            <GoogleButton
              onCredential={(c) => void a.signInWithCredential(c)}
            />
          ) : (
            <p className="text-sm text-warn">
              Falta NEXT_PUBLIC_GOOGLE_CLIENT_ID.
            </p>
          )}
          {a.signingIn && (
            <p className="text-xs text-muted">Entrando y sincronizando…</p>
          )}
          {a.error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm"
            >
              <WarningCircle
                size={18}
                weight="duotone"
                className="shrink-0 text-danger"
                aria-hidden
              />
              {a.error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {a.session.user.pictureUrl ? (
              // biome-ignore lint/performance/noImgElement: avatar externo de Google, sin optimizar
              <img
                src={a.session.user.pictureUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-11 rounded-full"
              />
            ) : (
              <span className="grid size-11 place-items-center rounded-full bg-accent-soft font-heading font-bold text-accent">
                {(a.session.user.name ??
                  a.session.user.email)[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {a.session.user.name ?? a.session.user.email}
              </p>
              <p className="truncate text-xs text-muted">
                {a.session.user.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-panel-2 p-3 text-sm">
            {a.sync.state === "syncing" ? (
              <ArrowsClockwise
                size={18}
                className="animate-spin text-muted"
                aria-hidden
              />
            ) : a.sync.state === "error" ? (
              <WarningCircle
                size={18}
                weight="duotone"
                className="text-danger"
                aria-hidden
              />
            ) : a.sync.state === "offline" ? (
              <CloudSlash
                size={18}
                weight="duotone"
                className="text-muted"
                aria-hidden
              />
            ) : (
              <CloudCheck
                size={18}
                weight="duotone"
                className="text-good"
                aria-hidden
              />
            )}
            <span className="min-w-0 flex-1">
              {a.sync.state === "syncing"
                ? "Sincronizando…"
                : a.sync.state === "error"
                  ? `No se pudo sincronizar: ${a.sync.error}`
                  : a.sync.state === "offline"
                    ? "Sin conexión: se sincroniza al volver."
                    : `Sincronizado ${ago(a.lastSync)}`}
              {a.pending > 0 && a.sync.state !== "syncing" && (
                <span className="text-muted">
                  {" "}
                  · {a.pending} cambios pendientes
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void a.syncNow()}
              disabled={a.sync.state === "syncing"}
              className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold disabled:opacity-50"
            >
              Ahora
            </button>
          </div>

          <PushRow />

          <div className="flex items-center justify-between text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CheckCircle
                size={12}
                weight="fill"
                className="text-good"
                aria-hidden
              />
              Tu token de Todoist no se sube: queda en cada dispositivo.
            </span>
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Cerrar sesión? Tus datos se quedan en este dispositivo.",
                  )
                )
                  void a.signOut();
              }}
              className="inline-flex items-center gap-1 hover:text-danger"
            >
              <SignOut size={14} weight="duotone" aria-hidden />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
