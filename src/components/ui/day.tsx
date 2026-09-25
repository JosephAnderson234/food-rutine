"use client";

import type { PortionState } from "@app/domain/types";
import type { DayView, MealView } from "@app/domain/week-view";
import { Backpack, Barbell, Snowflake, Sparkle } from "@phosphor-icons/react";
import { MODE_ICONS } from "./icons";

export const SLOT_LABEL = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
} as const;

const MODE_LABEL = { virtual: "Virtual", libre: "Sin clases" } as const;

const STATE_CHIP: Partial<
  Record<PortionState, { label: string; className: string }>
> = {
  frozen: { label: "Congelado", className: "bg-frost-soft text-frost" },
  thawing: { label: "Descongelando", className: "bg-frost-soft text-frost" },
  packed: { label: "En mochila", className: "bg-warn-soft text-warn" },
  eaten: { label: "Comido", className: "bg-good-soft text-good" },
  discarded: { label: "Descartado", className: "bg-danger-soft text-danger" },
};

export function Chip({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function ModeChip({ day }: { day: DayView }) {
  const Glyph = MODE_ICONS[day.mode];
  const campus = day.mode === "campus" && day.campus;
  return (
    <Chip
      className={
        campus ? "bg-accent-soft text-accent" : "bg-panel-2 text-muted"
      }
    >
      <Glyph size={13} weight="duotone" aria-hidden />
      {campus ? (
        <span className="font-mono">
          {day.campus?.from}–{day.campus?.to}
        </span>
      ) : (
        MODE_LABEL[day.mode as "virtual" | "libre"]
      )}
    </Chip>
  );
}

/** Etiquetas de una comida: dónde, tamaño, táper y estado de la porción. */
export function MealTags({ meal }: { meal: MealView }) {
  if (!meal.name) return null;
  const state = meal.portion && STATE_CHIP[meal.portion.state];
  return (
    <div className="flex flex-wrap gap-1">
      {meal.where === "u" && (
        <Chip className="bg-warn-soft text-warn">
          <Backpack size={12} weight="duotone" aria-hidden />
          En la U
        </Chip>
      )}
      {meal.size === "grande" && (
        <Chip className="bg-good-soft text-good">
          <Barbell size={12} weight="duotone" aria-hidden />
          Grande
        </Chip>
      )}
      {meal.portion?.containerNo !== undefined && (
        <Chip className="bg-panel text-muted">
          Táper <span className="font-mono">#{meal.portion.containerNo}</span>
        </Chip>
      )}
      {meal.portion && meal.portion.containerNo === undefined && (
        <Chip className="bg-accent-soft text-accent">
          <Sparkle size={12} weight="duotone" aria-hidden />
          Recién hecho
        </Chip>
      )}
      {state && (
        <Chip className={state.className}>
          {meal.portion?.state === "frozen" && (
            <Snowflake size={12} weight="duotone" aria-hidden />
          )}
          {state.label}
        </Chip>
      )}
    </div>
  );
}
