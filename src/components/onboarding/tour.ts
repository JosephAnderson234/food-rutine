"use client";

import "driver.js/dist/driver.css";
import { clearTour } from "@app/lib/onboarding";
import type { DriveStep } from "driver.js";

/** Pasos sobre la vista Semana; cada uno apunta a un `data-tour`. */
const STEPS: { target: string; title: string; text: string }[] = [
  {
    target: "week",
    title: "Tu semana",
    text: "La app arma la semana con tu horario: qué comes cada día, cuándo cocinas y cuándo vas al gym. Con las flechas ves la anterior o la siguiente.",
  },
  {
    target: "assistant",
    title: "Cuéntale tu semana",
    text: "Escribe tus eventos en palabras normales («parcial el jueves de 10 a 12») y el asistente los agrega y reacomoda la semana.",
  },
  {
    target: "summary",
    title: "De un vistazo",
    text: "Horas de prep, días de gym, almuerzos que llevas a la U y porciones que van al congelador.",
  },
  {
    target: "days",
    title: "Cada día",
    text: "Qué toca comer, qué sacar del congelador y qué cocinar. Toca un día para abrirlo o cerrarlo.",
  },
  {
    target: "nav-hoy",
    title: "Hoy",
    text: "Lo de hoy en orden, con la mochila: marca porciones comidas o empacadas.",
  },
  {
    target: "nav-compras",
    title: "Compras",
    text: "La lista sale sola del plan y descuenta lo que ya tienes en casa.",
  },
  {
    target: "nav-cocina",
    title: "Cocina",
    text: "Modo guía paso a paso, con temporizadores y reglas de seguridad alimentaria.",
  },
  {
    target: "settings",
    title: "Ajustes y cuenta",
    text: "Aquí inicias sesión para usarla en celular y laptop, y conectas Google Calendar y Todoist. Este recorrido también se puede repetir desde aquí.",
  },
];

const visible = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.getClientRects().length > 0;

/** Lanza el recorrido guiado (carga driver.js solo cuando hace falta). */
export async function startTour(): Promise<void> {
  clearTour();
  const { driver } = await import("driver.js");
  const steps: DriveStep[] = STEPS.flatMap(({ target, title, text }) => {
    const el = document.querySelector(`[data-tour="${target}"]`);
    return visible(el)
      ? [{ element: el, popover: { title, description: text } }]
      : [];
  });
  if (steps.length === 0) return;
  const tour = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Siguiente",
    prevBtnText: "Atrás",
    doneBtnText: "Listo",
    popoverClass: "mp-tour",
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 18,
    smoothScroll: true,
  });
  tour.drive();
}
