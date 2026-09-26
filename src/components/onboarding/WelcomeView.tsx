"use client";

import { GoogleButton } from "@app/components/settings/AccountSection";
import { useAccount } from "@app/data/use-account";
import { API_CONFIGURED } from "@app/integrations/backend/api";
import { GOOGLE_CLIENT_ID } from "@app/integrations/google/gis";
import { finishWelcome } from "@app/lib/onboarding";
import {
  ArrowRight,
  Backpack,
  Barbell,
  Basket,
  BellRinging,
  CalendarDots,
  CookingPot,
  Devices,
  type Icon,
  LockKey,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FLOW: { icon: Icon; label: string }[] = [
  { icon: CalendarDots, label: "Horario" },
  { icon: Basket, label: "Compras" },
  { icon: CookingPot, label: "Prep" },
  { icon: Backpack, label: "Mochila" },
  { icon: Barbell, label: "Gym" },
];

const PERKS: { icon: Icon; title: string; detail: string }[] = [
  {
    icon: Devices,
    title: "Celular y laptop, lo mismo",
    detail:
      "Planificas en la laptop, marcas porciones en el celular: todo se sincroniza solo.",
  },
  {
    icon: BellRinging,
    title: "Avisos con la app cerrada",
    detail: "Descongelar, lonchera y temporizadores llegan aunque no la abras.",
  },
  {
    icon: ShieldCheck,
    title: "Respaldo de tu semana",
    detail:
      "Si borras el navegador o cambias de celular, tus datos siguen en tu cuenta.",
  },
  {
    icon: LockKey,
    title: "Integraciones que te siguen",
    detail:
      "Calendar, Todoist y tus ajustes viajan contigo; los tokens se guardan cifrados.",
  },
];

/** Primer arranque en este dispositivo: explica la app y empuja a iniciar sesión. */
export function WelcomeView() {
  const router = useRouter();
  const a = useAccount();
  const [skipping, setSkipping] = useState(false);
  const canSignIn = API_CONFIGURED && Boolean(GOOGLE_CLIENT_ID);

  const done = () => {
    finishWelcome();
    router.replace("/semana");
  };

  // Al iniciar sesión (o si ya había sesión), directo a la semana con el recorrido.
  const signedIn = Boolean(a.session) && !a.signingIn;
  useEffect(() => {
    if (!signedIn) return;
    finishWelcome();
    router.replace("/semana");
  }, [signedIn, router]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-8">
        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Meal Prep
          </p>
          <h1 className="text-5xl leading-[0.9] font-bold sm:text-6xl">
            Tu semana,
            <br />
            ya cocinada.
          </h1>
          <p className="max-w-md text-muted">
            Lee tu horario de la U, arma las comidas, te dice qué comprar,
            cuándo cocinar y qué llevar en la mochila.
          </p>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            {FLOW.map(({ icon: Glyph, label }, i) => (
              <motion.li
                key={label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="flex items-center gap-1.5"
              >
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1">
                  <Glyph size={14} weight="duotone" aria-hidden />
                  {label}
                </span>
                {i < FLOW.length - 1 && (
                  <ArrowRight size={12} className="text-muted" aria-hidden />
                )}
              </motion.li>
            ))}
          </ol>
        </header>

        <section
          aria-labelledby="welcome-account"
          className="relative space-y-5 overflow-hidden rounded-3xl border border-accent/40 bg-panel p-5"
        >
          <div className="space-y-1.5">
            <span className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-panel uppercase">
              Muy recomendado
            </span>
            <h2 id="welcome-account" className="text-2xl font-semibold">
              Inicia sesión antes de empezar
            </h2>
            <p className="text-sm text-muted">
              Sin cuenta, la app vive solo en este navegador. Con cuenta, la
              usas en todos tus dispositivos.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {PERKS.map(({ icon: Glyph, title, detail }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Glyph size={18} weight="duotone" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted">{detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {canSignIn ? (
            <div className="space-y-2">
              <GoogleButton
                onCredential={(c) => void a.signInWithCredential(c)}
              />
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
            <p className="text-sm text-warn">
              La cuenta aún no está configurada en este despliegue: puedes
              empezar sin ella.
            </p>
          )}
        </section>

        <AnimatePresence mode="wait" initial={false}>
          {!canSignIn ? (
            <motion.button
              key="start"
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={done}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-text py-3 font-semibold text-bg"
            >
              Empezar
              <ArrowRight size={16} weight="bold" aria-hidden />
            </motion.button>
          ) : !skipping ? (
            <motion.div
              key="skip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <button
                type="button"
                onClick={() => setSkipping(true)}
                className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-text"
              >
                Seguir sin cuenta
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="confirm"
              role="alertdialog"
              aria-labelledby="skip-title"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3 rounded-3xl border border-warn/40 bg-warn-soft p-4"
            >
              <p id="skip-title" className="flex items-start gap-2 text-sm">
                <WarningCircle
                  size={18}
                  weight="duotone"
                  className="mt-px shrink-0 text-warn"
                  aria-hidden
                />
                Tus datos quedarán solo en este navegador: si lo borras o
                cambias de dispositivo, se pierden. Puedes iniciar sesión cuando
                quieras en Ajustes y no pierdes nada de lo que hayas anotado.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSkipping(false)}
                  className="rounded-full bg-text py-2.5 text-sm font-semibold text-bg"
                >
                  Mejor inicio sesión
                </button>
                <button
                  type="button"
                  onClick={done}
                  className="rounded-full border border-line bg-panel py-2.5 text-sm font-semibold"
                >
                  Entendido, seguir sin cuenta
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
