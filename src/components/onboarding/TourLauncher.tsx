"use client";

import { tourPending } from "@app/lib/onboarding";
import { useEffect } from "react";
import { startTour } from "./tour";

/** Si la bienvenida (o Ajustes) dejó el recorrido pendiente, lo lanza al montar la semana. */
export function TourLauncher() {
  useEffect(() => {
    if (!tourPending()) return;
    // Deja terminar la animación de entrada de los días antes de medirlos.
    const t = window.setTimeout(() => void startTour(), 600);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
