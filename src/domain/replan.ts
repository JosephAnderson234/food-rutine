import { diffDays, type ISODate } from "./dates";
import type { Portion } from "./types";

export interface CarryOver {
  portions: Portion[];
  /** Avisos para mostrar junto al plan recalculado. */
  notes: string[];
}

/**
 * Une un plan recalculado con el estado guardado.
 * Lo que ya se cocinó (prep en o antes de `today`) es comida real: conserva estado,
 * táper y plato aunque el plan nuevo diga otra cosa. Lo que aún no se cocina toma
 * el plan nuevo, pero si el usuario ya actuó sobre una porción (improbable antes de
 * cocinarla) su acción se respeta.
 */
export function carryOver(
  next: Portion[],
  prev: Portion[],
  today: ISODate,
): CarryOver {
  const byId = new Map(prev.map((p) => [p.id, p]));
  const notes: string[] = [];
  const portions = next.map((n) => {
    const old = byId.get(n.id);
    if (!old) return n;
    const cooked = diffDays(old.cookedOn, today) >= 0;
    if (cooked) {
      if (old.state === "fridge" && n.state === "frozen") {
        notes.push(
          `${old.label}: está en la refri aunque el plan nuevo la congelaría. Congélala hoy si no se come dentro de 2 días.`,
        );
      }
      return { ...n, ...pick(old) };
    }
    const acted = old.state !== "fridge" && old.state !== "frozen";
    return acted ? { ...n, state: old.state } : n;
  });

  const kept = new Set(portions.map((p) => p.id));
  for (const old of prev) {
    const cooked = diffDays(old.cookedOn, today) >= 0;
    const alive = old.state !== "eaten" && old.state !== "discarded";
    if (!kept.has(old.id) && cooked && alive) {
      portions.push(old);
      notes.push(
        `${old.label}: ya está cocinada pero el plan nuevo no la usa. Sigue en tu lista.`,
      );
    }
  }
  return { portions, notes };
}

function pick(p: Portion): Partial<Portion> {
  return {
    state: p.state,
    containerNo: p.containerNo,
    assemblyId: p.assemblyId,
    componentIds: p.componentIds,
    size: p.size,
    label: p.label,
    cookedOn: p.cookedOn,
  };
}
