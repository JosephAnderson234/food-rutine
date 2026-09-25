"use client";

/**
 * Google Identity Services, modelo de token (solo navegador, sin backend).
 * El token de acceso vive en memoria (~1 h); al vencer se pide otro con un toque.
 */

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/**
 * Permisos mínimos:
 * - leer la lista de calendarios y los eventos (cursos y eventos flexibles),
 * - crear y administrar SOLO los calendarios que crea la app ("Meal Prep").
 * La app no puede modificar ni borrar tus otros eventos.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
].join(" ");

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: {
              type: string;
              message?: string;
            }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let token: { value: string; expiresAt: number } | null = null;
let loading: Promise<void> | null = null;

export class GoogleAuthRequired extends Error {
  constructor() {
    super("Conéctate con Google para continuar.");
  }
}

/** Carga el script de Google una sola vez (conviene precargarlo al montar la pantalla). */
export function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("No se pudo cargar Google (¿sin conexión?)."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function hasValidToken(): boolean {
  return token !== null && token.expiresAt - 60_000 > Date.now();
}

/**
 * Token de acceso. Con `interactive` abre el popup de Google si hace falta
 * (debe llamarse desde un toque del usuario para que el navegador no lo bloquee).
 */
export async function getAccessToken({
  interactive,
}: {
  interactive: boolean;
}): Promise<string> {
  if (token && hasValidToken()) return token.value;
  if (!interactive) throw new GoogleAuthRequired();
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Falta NEXT_PUBLIC_GOOGLE_CLIENT_ID en .env.local");
  }
  await loadGis();
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) throw new Error("Google no respondió.");
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      // Sin forzar pantalla de consentimiento: si ya diste permiso, es un toque.
      prompt: "",
      callback: (r) => {
        if (r.error) {
          reject(new Error(r.error_description ?? r.error));
          return;
        }
        token = {
          value: r.access_token,
          expiresAt: Date.now() + r.expires_in * 1000,
        };
        resolve(r.access_token);
      },
      error_callback: (e) =>
        reject(
          new Error(
            e.type === "popup_closed"
              ? "Cerraste la ventana de Google."
              : e.type === "popup_failed_to_open"
                ? "El navegador bloqueó la ventana de Google."
                : (e.message ?? e.type),
          ),
        ),
    });
    client.requestAccessToken();
  });
}

/** Revoca el permiso y olvida el token. */
export function disconnectGoogle(): void {
  const current = token?.value;
  token = null;
  if (current) window.google?.accounts.oauth2.revoke(current);
}
