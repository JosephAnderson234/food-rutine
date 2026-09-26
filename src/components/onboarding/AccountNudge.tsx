"use client";

import { useAccount } from "@app/data/use-account";
import { API_CONFIGURED } from "@app/integrations/backend/api";
import { nudgeHidden, snoozeNudge } from "@app/lib/onboarding";
import { CloudWarning, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Sin sesión, recuerda que los datos viven solo en este navegador. Se pospone 3 días. */
export function AccountNudge() {
  const a = useAccount();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(nudgeHidden()), []);
  const show = API_CONFIGURED && a.ready && !a.session && !hidden;

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside
          aria-label="Cuenta"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-3 rounded-3xl border border-warn/40 bg-warn-soft p-4">
            <CloudWarning
              size={22}
              weight="duotone"
              className="mt-0.5 shrink-0 text-warn"
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm">
                <span className="font-semibold">
                  Tu semana solo está en este navegador.
                </span>{" "}
                Inicia sesión para tenerla en el celular y la laptop, recibir
                avisos con la app cerrada y no perderla si borras el navegador.
              </p>
              <Link
                href="/ajustes"
                className="inline-flex rounded-full bg-text px-3.5 py-1.5 text-xs font-semibold text-bg"
              >
                Iniciar sesión
              </Link>
            </div>
            <button
              type="button"
              aria-label="Recordar en 3 días"
              title="Recordar en 3 días"
              onClick={() => {
                snoozeNudge();
                setHidden(true);
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel hover:text-text"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
