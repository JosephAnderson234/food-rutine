"use client";

import { requestTour } from "@app/lib/onboarding";
import {
  canPromptInstall,
  isIOS,
  isStandalone,
  notificationsSupported,
  persistStorage,
  promptInstall,
  requestNotifications,
  SW_ENABLED,
  storagePersisted,
  subscribeInstall,
} from "@app/lib/pwa";
import {
  Bell,
  CheckCircle,
  Compass,
  DeviceMobile,
  HardDrives,
  ShareNetwork,
  WifiSlash,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function Row({
  icon: Glyph,
  title,
  detail,
  action,
}: {
  icon: typeof Bell;
  title: string;
  detail: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Glyph
        size={20}
        weight="duotone"
        className="mt-0.5 shrink-0 text-muted"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      {action}
    </li>
  );
}

const Ok = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-medium text-good">
    <CheckCircle size={12} weight="fill" aria-hidden />
    {children}
  </span>
);

const btn =
  "shrink-0 rounded-full bg-text px-3 py-1.5 text-xs font-semibold text-bg";

export function AppSection() {
  const router = useRouter();
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    setStandalone(isStandalone());
    setIos(isIOS());
    setInstallable(canPromptInstall());
    setPermission(
      notificationsSupported() ? Notification.permission : "unsupported",
    );
    void storagePersisted().then(setPersisted);
    return subscribeInstall(() => setInstallable(canPromptInstall()));
  }, []);

  return (
    <section className="space-y-2 rounded-3xl border border-line bg-panel p-4">
      <h2 className="text-xl font-semibold">App</h2>
      <ul className="divide-y divide-line">
        <Row
          icon={Compass}
          title="Recorrido guiado"
          detail="Vuelve a ver para qué sirve cada parte de la app."
          action={
            <button
              type="button"
              className={btn}
              onClick={() => {
                requestTour();
                router.push("/semana");
              }}
            >
              Ver
            </button>
          }
        />
        <Row
          icon={DeviceMobile}
          title="Instalar en el celular"
          detail={
            standalone
              ? "Ya la usas como app."
              : ios
                ? "En Safari: Compartir → «Agregar a inicio»."
                : installable
                  ? "Ábrela desde tu pantalla de inicio, sin barra del navegador."
                  : "Desde el menú del navegador: «Instalar app» o «Agregar a inicio»."
          }
          action={
            standalone ? (
              <Ok>Instalada</Ok>
            ) : ios ? (
              <ShareNetwork
                size={18}
                weight="duotone"
                className="text-muted"
                aria-hidden
              />
            ) : installable ? (
              <button
                type="button"
                className={btn}
                onClick={() => void promptInstall()}
              >
                Instalar
              </button>
            ) : undefined
          }
        />
        <Row
          icon={Bell}
          title="Avisos de temporizadores"
          detail={
            permission === "unsupported"
              ? "Este navegador no permite avisos."
              : permission === "denied"
                ? "Bloqueados: actívalos en los permisos del sitio."
                : "Suenan y aparecen aunque estés en otra pantalla o pestaña (con la app abierta)."
          }
          action={
            permission === "granted" ? (
              <Ok>Activos</Ok>
            ) : permission === "default" ? (
              <button
                type="button"
                className={btn}
                onClick={() => void requestNotifications().then(setPermission)}
              >
                Activar
              </button>
            ) : undefined
          }
        />
        <Row
          icon={HardDrives}
          title="Datos guardados en este dispositivo"
          detail={
            persisted
              ? "Protegidos: el navegador no los borrará por falta de espacio."
              : "Pueden borrarse si el celular se queda sin espacio. Instalar la app ayuda."
          }
          action={
            persisted ? (
              <Ok>Protegidos</Ok>
            ) : (
              <button
                type="button"
                className={btn}
                onClick={() => void persistStorage().then(setPersisted)}
              >
                Proteger
              </button>
            )
          }
        />
        <Row
          icon={WifiSlash}
          title="Sin conexión"
          detail={
            SW_ENABLED
              ? "Semana, Hoy, Compras, Cocina y Ajustes abren sin internet. Google, Todoist y el asistente necesitan conexión."
              : "En desarrollo el modo sin conexión está apagado; se activa en la versión compilada."
          }
        />
      </ul>
    </section>
  );
}
