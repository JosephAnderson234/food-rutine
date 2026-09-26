"use client";

import { type AuthedApi, vapidPublicKey } from "@app/integrations/backend/api";

/** Avisos push reales (llegan con la app cerrada): suscripción Web Push del navegador. */

export type PushState = "unsupported" | "no-sw" | "denied" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export async function pushState(): Promise<PushState> {
  if (
    typeof window === "undefined" ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "no-sw";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** Pide permiso, suscribe este dispositivo y lo registra en el backend. */
export async function enablePush(
  api: Pick<AuthedApi, "subscribe">,
): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) return "no-sw";
  const { publicKey } = await vapidPublicKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  await api.subscribe(sub.toJSON());
  return "on";
}

export async function disablePush(
  api: Pick<AuthedApi, "unsubscribe">,
): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api.unsubscribe(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
  return "off";
}
