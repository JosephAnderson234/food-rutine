/**
 * Primer uso en este dispositivo: bienvenida, recorrido guiado y recordatorio de iniciar
 * sesión. Son comodidades por navegador (localStorage); si el almacenamiento falla, la app
 * sigue funcionando y a lo sumo vuelve a mostrar la bienvenida.
 */

const WELCOMED = "mp.welcomed";
const TOUR_PENDING = "mp.tourPending";
const NUDGE_HIDDEN_UNTIL = "mp.accountNudgeHiddenUntil";

const NUDGE_SNOOZE_MS = 3 * 24 * 60 * 60_000;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Modo privado o almacenamiento bloqueado: no pasa nada.
  }
}

export const wasWelcomed = () => read(WELCOMED) === "1";

/** Cierra la bienvenida y deja el recorrido listo para la vista Semana. */
export function finishWelcome(): void {
  write(WELCOMED, "1");
  write(TOUR_PENDING, "1");
}

export const tourPending = () => read(TOUR_PENDING) === "1";
export const requestTour = () => write(TOUR_PENDING, "1");
export const clearTour = () => write(TOUR_PENDING, null);

export function nudgeHidden(): boolean {
  const until = Number(read(NUDGE_HIDDEN_UNTIL) ?? 0);
  return Date.now() < until;
}

export const snoozeNudge = () =>
  write(NUDGE_HIDDEN_UNTIL, String(Date.now() + NUDGE_SNOOZE_MS));
