"use client";

import type { FoodIcon, TaskKind } from "@app/domain/types";
import type { DayMode } from "@app/domain/week-view";
import {
  Backpack,
  Barbell,
  Bird,
  BowlFood,
  BowlSteam,
  Carrot,
  CookingPot,
  Cow,
  Drop,
  Egg,
  Fire,
  ForkKnife,
  GraduationCap,
  Grains,
  House,
  type Icon,
  type IconProps,
  Jar,
  Snowflake,
  ThermometerCold,
  VideoCamera,
} from "@phosphor-icons/react";

/** El dominio habla en claves semánticas; aquí se decide el dibujo. */
export const FOOD_ICONS: Record<FoodIcon, Icon> = {
  chicken: Bird,
  beef: Cow,
  rice: Grains,
  veggies: Carrot,
  pasta: ForkKnife,
  sauce: Jar,
  egg: Egg,
  bowl: BowlFood,
  wok: CookingPot,
  oats: BowlSteam,
};

export const TASK_ICONS: Record<TaskKind, Icon> = {
  prep: CookingPot,
  gym: Barbell,
  freeze: Snowflake,
  thaw: Drop,
  gelpacks: ThermometerCold,
  pack: Backpack,
  finish: Fire,
};

/** Nombre corto de cada tipo de tarea (chips, resúmenes). */
export const TASK_SHORT: Record<TaskKind, string> = {
  prep: "Meal prep",
  gym: "Gym",
  freeze: "Congelar",
  thaw: "Descongelar",
  gelpacks: "Gel packs",
  pack: "Lonchera",
  finish: "Cocinar",
};

export const TASK_TONE: Record<TaskKind, string> = {
  prep: "text-accent bg-accent-soft",
  gym: "text-good bg-good-soft",
  freeze: "text-frost bg-frost-soft",
  thaw: "text-frost bg-frost-soft",
  gelpacks: "text-frost bg-frost-soft",
  pack: "text-warn bg-warn-soft",
  finish: "text-accent bg-accent-soft",
};

export const MODE_ICONS: Record<DayMode, Icon> = {
  campus: GraduationCap,
  virtual: VideoCamera,
  libre: House,
};

export function FoodGlyph({
  icon,
  ...props
}: { icon: FoodIcon | null } & IconProps) {
  const Glyph = icon ? FOOD_ICONS[icon] : ForkKnife;
  return <Glyph weight="duotone" aria-hidden {...props} />;
}
