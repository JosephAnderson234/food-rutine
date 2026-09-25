import {
  addDays,
  diffDays,
  fromMinutes,
  type HHmm,
  type ISODate,
  toMinutes,
} from "./dates";
import type { Portion, PortionState, Settings } from "./types";

/** Referencias USDA FSIS usadas por el sistema. */
export const FOOD_SAFETY = {
  coolWithinHours: 2,
  /** Con ambiente sobre ~32 °C el límite baja a 1 h. */
  coolWithinHoursHot: 1,
  hotAmbientC: 32,
  fridgeMaxC: 4,
  freezerC: -18,
  safeInternalTempC: { pollo: 74, carneMolida: 71 },
} as const;

export type StorageDecision =
  | { state: "fridge" }
  | { state: "frozen"; thawOn: ISODate; forced: boolean };

/**
 * Decide si una porción va a la refri o al congelador.
 * - Hasta `freezeAfterDays` → refri.
 * - Más de eso → congelador, con descongelado la noche anterior.
 * - Más de `fridgeMaxDays` → congelador obligatorio (forced).
 */
export function storageFor(
  cookedOn: ISODate,
  eatOn: ISODate,
  safety: Settings["safety"],
): StorageDecision {
  const days = diffDays(cookedOn, eatOn);
  if (days < 0)
    throw new Error(
      `Porción comida (${eatOn}) antes de cocinarse (${cookedOn})`,
    );
  if (days <= safety.freezeAfterDays) return { state: "fridge" };
  return {
    state: "frozen",
    thawOn: addDays(eatOn, -1),
    forced: days > safety.fridgeMaxDays,
  };
}

/** Hora límite para tener todo refrigerado después de cocinar. */
export function coolDeadline(cookEnd: HHmm, ambientC?: number): HHmm {
  const hours =
    ambientC !== undefined && ambientC > FOOD_SAFETY.hotAmbientC
      ? FOOD_SAFETY.coolWithinHoursHot
      : FOOD_SAFETY.coolWithinHours;
  return fromMinutes(Math.min(toMinutes(cookEnd) + hours * 60, 23 * 60 + 59));
}

// ── Ciclo de vida de una porción ────────────────────────────────────────────

export type PortionAction = "freeze" | "thaw" | "pack" | "eat" | "discard";

const TRANSITIONS: Record<
  PortionAction,
  { from: PortionState[]; to: PortionState }
> = {
  freeze: { from: ["fridge"], to: "frozen" },
  thaw: { from: ["frozen"], to: "thawing" },
  pack: { from: ["fridge", "thawing"], to: "packed" },
  eat: { from: ["fridge", "thawing", "packed"], to: "eaten" },
  discard: { from: ["fridge", "frozen", "thawing", "packed"], to: "discarded" },
};

export function canApply(state: PortionState, action: PortionAction): boolean {
  return TRANSITIONS[action].from.includes(state);
}

/**
 * Aplica una acción. Una porción empacada (estuvo fuera de la refri) nunca vuelve a
 * "fridge": solo puede comerse o descartarse.
 */
export function applyAction(portion: Portion, action: PortionAction): Portion {
  if (!canApply(portion.state, action)) {
    throw new Error(
      `No se puede "${action}" una porción en estado "${portion.state}"`,
    );
  }
  return { ...portion, state: TRANSITIONS[action].to };
}

export type AlertLevel = "info" | "warn" | "danger";
export interface PortionAlert {
  level: AlertLevel;
  message: string;
}

/** Alertas para una porción en la fecha `today`. */
export function portionAlerts(
  portion: Portion,
  today: ISODate,
  safety: Settings["safety"],
): PortionAlert[] {
  const alerts: PortionAlert[] = [];
  if (portion.state === "eaten" || portion.state === "discarded") return alerts;

  const age = diffDays(portion.cookedOn, today);
  if (
    (portion.state === "fridge" || portion.state === "thawing") &&
    age > safety.fridgeMaxDays
  ) {
    alerts.push({
      level: "danger",
      message: `${portion.label}: ${age} días en refri (máx. ${safety.fridgeMaxDays}). Desechar.`,
    });
  }
  if (portion.state === "frozen" && diffDays(today, portion.eatOn) <= 0) {
    alerts.push({
      level: "warn",
      message: `${portion.label} sigue congelada y es para hoy. Descongelar en refri, no a temperatura ambiente.`,
    });
  } else if (
    portion.state === "frozen" &&
    diffDays(today, portion.eatOn) === 1
  ) {
    alerts.push({
      level: "info",
      message: `${portion.label}: pásala del congelador a la refri esta noche.`,
    });
  }
  if (portion.state === "packed" && diffDays(portion.eatOn, today) > 0) {
    alerts.push({
      level: "danger",
      message: `${portion.label} estuvo fuera y no se comió. No vuelve a la refri: desechar.`,
    });
  }
  return alerts;
}
