"use client";

import { useEffect } from "react";

/** Aviso de temporizador: vibración (si hay) y tres pitidos cortos con Web Audio. */
export function ring(): void {
  try {
    navigator.vibrate?.([250, 120, 250, 120, 250]);
  } catch {
    // sin vibración: seguimos con el sonido
  }
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    [0, 0.28, 0.56].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.3,
        ctx.currentTime + offset + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + offset + 0.22,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.25);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // audio bloqueado por el navegador: queda el aviso visual
  }
}

/** Mantiene la pantalla encendida mientras `active` (si el navegador lo permite). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // p. ej. batería baja o pestaña oculta
      }
    };
    void acquire();
    // Al volver a la pestaña el bloqueo se pierde: se pide de nuevo.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
