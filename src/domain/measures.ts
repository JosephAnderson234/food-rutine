import type { Ingredient } from "./types";

const FRACTIONS: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

/** 1.5 → "1½", 0.25 → "¼", 2 → "2". */
export function formatFraction(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 4) / 4;
  if (frac === 1) return String(whole + 1);
  const f = FRACTIONS[frac] ?? "";
  return whole === 0 ? f || "0" : `${whole}${f}`;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * Cantidad legible en la cocina:
 * condimentos y líquidos en cucharaditas/cucharadas, unidades enteras, gramos redondeados.
 */
export function formatKitchen(ing: Ingredient, qty: number): string {
  if (ing.unit === "u") {
    const n = roundTo(qty, 0.5);
    return `${formatFraction(n)} ${n === 1 ? "unidad" : "unidades"}`;
  }
  if (ing.tsp) {
    const tsp = qty / ing.tsp;
    if (tsp >= 3) return `${formatFraction(roundTo(tsp / 3, 0.5))} cda`;
    const t = roundTo(tsp, 0.25);
    return t === 0 ? "una pizca" : `${formatFraction(t)} cdta`;
  }
  if (qty >= 1000)
    return `${Number((qty / 1000).toFixed(2))} ${ing.unit === "g" ? "kg" : "L"}`;
  const n = qty < 20 ? Math.round(qty) : roundTo(qty, 5);
  return `${Math.max(1, n)} ${ing.unit}`;
}
