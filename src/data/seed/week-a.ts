import type { MealTemplate, WeekTemplate } from "@app/domain/types";

const DOM = "prep-dom";
const MIE = "prep-mie";

const meals: MealTemplate[] = [
  { weekday: 1, slot: "desayuno", assemblyId: "avena-platano" },
  { weekday: 1, slot: "almuerzo", assemblyId: "bowl-pollo", prepId: DOM },
  { weekday: 1, slot: "cena", assemblyId: "bowl-pollo", prepId: DOM },

  { weekday: 2, slot: "desayuno", assemblyId: "huevos-pan" },
  { weekday: 2, slot: "almuerzo", assemblyId: "bowl-pollo", prepId: DOM },
  { weekday: 2, slot: "cena", assemblyId: "chaufa-pollo", prepId: DOM },

  { weekday: 3, slot: "desayuno", assemblyId: "avena-platano" },
  { weekday: 3, slot: "almuerzo", assemblyId: "bowl-pollo", prepId: DOM },
  { weekday: 3, slot: "cena", assemblyId: "bowl-carne", prepId: MIE },

  { weekday: 4, slot: "desayuno", assemblyId: "huevos-pan" },
  { weekday: 4, slot: "almuerzo", assemblyId: "bowl-carne", prepId: MIE },
  { weekday: 4, slot: "cena", assemblyId: "bowl-carne", prepId: MIE },

  { weekday: 5, slot: "desayuno", assemblyId: "avena-platano" },
  { weekday: 5, slot: "almuerzo", assemblyId: "pasta-carne", prepId: MIE },
  { weekday: 5, slot: "cena", assemblyId: "bowl-carne", prepId: MIE },

  { weekday: 6, slot: "desayuno", assemblyId: "huevos-pan" },
  { weekday: 6, slot: "almuerzo", assemblyId: "bowl-carne-huevo", prepId: MIE },
  { weekday: 6, slot: "cena", assemblyId: null },

  { weekday: 0, slot: "desayuno", assemblyId: null },
  { weekday: 0, slot: "almuerzo", assemblyId: null },
  { weekday: 0, slot: "cena", assemblyId: null },
];

/** Semana A: domingo pollo (lun–mié), miércoles carne (mié noche–sáb). */
export const WEEK_A: WeekTemplate = {
  id: "A",
  name: "Semana A · Pollo / Carne",
  preps: [
    {
      id: DOM,
      name: "Meal prep domingo",
      icon: "chicken",
      weekday: 0,
      preferredStart: "16:00",
      window: { from: "09:00", to: "21:00" },
    },
    {
      id: MIE,
      name: "Meal prep miércoles",
      icon: "beef",
      weekday: 3,
      preferredStart: "19:30",
      window: { from: "19:00", to: "23:00" },
    },
  ],
  meals,
  extras: [
    { ingredientId: "atun", qty: 2 },
    { ingredientId: "platano", qty: 3 },
    { ingredientId: "yogurt", qty: 1000 },
  ],
};
