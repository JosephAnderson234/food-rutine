import type { Catalog } from "./catalog";
import { type HHmm, type ISODate, toMinutes } from "./dates";
import { FOOD_SAFETY } from "./safety";
import type { WeekPlan } from "./types";
import { containerName } from "./week";

export interface PackingItem {
  id: string;
  label: string;
  /** De dónde sacarlo. */
  from?: "refri" | "congelador" | "cajón";
}

export interface PackingList {
  date: ISODate;
  items: PackingItem[];
  reminders: string[];
}

/** Qué meter en la mochila un día con almuerzo en la U; null si ese día se come en casa. */
export function packingFor(
  plan: WeekPlan,
  date: ISODate,
  catalog: Catalog,
  opts: { coldPacks?: number; lunchFrom?: HHmm } = {},
): PackingList | null {
  const coldPacks = opts.coldPacks ?? 0;
  const meal = plan.meals.find((m) => m.date === date && m.where === "u");
  if (!meal) return null;

  const portion = plan.portions.find((p) => p.id === meal.portionId);
  const assembly = meal.assemblyId
    ? catalog.assemblies.get(meal.assemblyId)
    : undefined;
  const hasSauceComponent = assembly?.components.some(
    (id) => catalog.components.get(id)?.storage === "salsa",
  );

  const items: PackingItem[] = [];
  const reminders: string[] = [];

  if (portion) {
    items.push({
      id: "taper",
      label: `${containerName(portion)} — ${portion.label}`,
      from: "refri",
    });
    if (portion.state === "frozen") {
      reminders.push(
        `${portion.label} sigue congelada: debió pasar a la refri anoche. Si está dura, cómela en casa y lleva otra opción.`,
      );
    }
  } else if (assembly) {
    items.push({ id: "taper", label: `Táper con ${assembly.name}` });
  }
  if (hasSauceComponent)
    items.push({
      id: "salsa",
      label: "Recipiente pequeño con la salsa",
      from: "refri",
    });
  if (assembly?.sauceOnSide)
    items.push({
      id: "sillao",
      label: "Recipiente pequeño con sillao/ají",
      from: "refri",
    });
  items.push({ id: "lonchera", label: "Lonchera térmica" });
  for (let i = 1; i <= coldPacks; i++) {
    items.push({
      id: `gel${i}`,
      label: `Gel pack #${i}${i === 1 ? " (debajo del táper)" : " (encima o al lado)"}`,
      from: "congelador",
    });
  }
  items.push(
    { id: "cubiertos", label: "Cubiertos", from: "cajón" },
    { id: "servilleta", label: "Servilleta", from: "cajón" },
  );

  const packAt = plan.tasks.find(
    (t) => t.date === date && t.kind === "pack",
  )?.time;
  const hoursOut =
    packAt && opts.lunchFrom
      ? Math.round(((toMinutes(opts.lunchFrom) - toMinutes(packAt)) / 60) * 2) /
        2
      : null;
  if (coldPacks > 0) {
    reminders.push(
      "Si hay refri en la U, guárdalo al llegar; si no, lonchera cerrada con los gel packs.",
    );
  } else if (hoursOut !== null && hoursOut > FOOD_SAFETY.coolWithinHours) {
    reminders.push(
      `Sin acumuladores de frío el táper pasa ~${hoursOut} h fuera de la refri (lo seguro son ${FOOD_SAFETY.coolWithinHours} h). Guárdalo en una refri de la U al llegar o congela una botella de agua la noche anterior y úsala como acumulador.`,
    );
  } else {
    reminders.push("Si hay refri en la U, guárdalo al llegar.");
  }
  reminders.push(
    "Caliéntalo bien antes de comer. Lo que sobre no vuelve a la refri.",
  );
  return { date, items, reminders };
}
