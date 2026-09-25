"use client";

/** Utilidades de PWA: service worker, instalación, avisos y almacenamiento persistente. */

export const SW_ENABLED = process.env.NODE_ENV === "production";

// ── Instalación ─────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredInstall: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Guarda el evento de instalación (Chrome/Android) para ofrecerlo con un botón propio. */
export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferredInstall = e as BeforeInstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferredInstall = null;
    emit();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => deferredInstall !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  emit();
  return outcome === "accepted";
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// ── Avisos ──────────────────────────────────────────────────────────────────

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotifications(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  return Notification.requestPermission();
}

/** Aviso del sistema (vía service worker si hay, para que funcione con la pestaña en segundo plano). */
export async function notify(
  title: string,
  body: string,
  url = "/cocina",
): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted")
    return;
  const options: NotificationOptions & { data: { url: string } } = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `${title}:${body}`,
    data: { url },
  };
  const reg =
    "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;
  if (reg) await reg.showNotification(title, options);
  else new Notification(title, options);
}

// ── Almacenamiento ──────────────────────────────────────────────────────────

/** Pide que el navegador no borre los datos locales cuando falte espacio. */
export async function persistStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storagePersisted(): Promise<boolean> {
  return (await navigator.storage?.persisted?.()) ?? false;
}
