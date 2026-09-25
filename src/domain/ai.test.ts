import { FIXED_COURSES } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { catalog, WEEK } from "../test/fixtures";
import {
  inventorySchema,
  previewInventory,
  validateBlocks,
  weekBlocksSchema,
  weekContext,
  weekPrompt,
} from "./ai";
import { expandFixedCourses } from "./schedule";

describe("semana rota", () => {
  const ctx = weekContext(
    WEEK,
    "2026-09-28",
    expandFixedCourses(FIXED_COURSES, WEEK),
  );

  it("el contexto lista los 7 días con lo que ya está ocupado", () => {
    expect(ctx.days.map((d) => d.dayName)[4]).toBe("Jueves");
    expect(ctx.days[4].busy).toEqual(["07:00-09:00 Machine Learning"]);
    expect(weekPrompt(ctx, "parcial el jueves").prompt).toContain(
      "Hoy es 2026-09-28",
    );
  });

  it("acepta bloques válidos como eventos flexibles de la app", () => {
    const { events, rejected } = validateBlocks(
      {
        blocks: [
          {
            date: "2026-10-01",
            start: "10:00",
            end: "12:00",
            title: "Parcial ML",
          },
        ],
        summary: "",
        questions: [],
      },
      WEEK,
    );
    expect(rejected).toEqual([]);
    expect(events[0]).toMatchObject({
      date: "2026-10-01",
      kind: "flexible",
      source: "app",
      title: "Parcial ML",
    });
  });

  it("rechaza fechas fuera de la semana y horas imposibles", () => {
    const { events, rejected } = validateBlocks(
      {
        blocks: [
          { date: "2026-10-05", start: "10:00", end: "12:00", title: "Fuera" },
          {
            date: "2026-10-01",
            start: "14:00",
            end: "13:00",
            title: "Al revés",
          },
          {
            date: "2026-10-01",
            start: "25:00",
            end: "26:00",
            title: "Hora rara",
          },
        ],
        summary: "",
        questions: [],
      },
      WEEK,
    );
    expect(events).toEqual([]);
    expect(rejected).toHaveLength(3);
  });

  it("el esquema no tiene campos opcionales (modo estricto de Groq)", () => {
    const json = z.toJSONSchema(weekBlocksSchema) as { required: string[] };
    expect(json.required.sort()).toEqual(["blocks", "questions", "summary"]);
  });
});

describe("inventario por texto", () => {
  const ids = [...catalog.ingredients.keys()];

  it("el esquema solo admite ids del catálogo", () => {
    const schema = inventorySchema(ids);
    expect(
      schema.safeParse({
        changes: [{ ingredientId: "pollo", op: "add", qty: 1000 }],
        unknown: [],
        summary: "",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        changes: [{ ingredientId: "quinua", op: "add", qty: 1 }],
        unknown: [],
        summary: "",
      }).success,
    ).toBe(false);
  });

  it("vista previa: compré, me queda y se acabó", () => {
    const preview = previewInventory(
      new Map([
        ["huevo", 2],
        ["arroz", 500],
      ]),
      {
        changes: [
          { ingredientId: "pollo", op: "add", qty: 1000 },
          { ingredientId: "huevo", op: "set", qty: 5 },
          { ingredientId: "arroz", op: "remove", qty: 800 },
        ],
        unknown: ["quinua"],
        summary: "",
      },
      catalog,
    );
    expect(preview.map((p) => [p.ingredientId, p.before, p.after])).toEqual([
      ["pollo", 0, 1000],
      ["huevo", 2, 5],
      ["arroz", 500, 0],
    ]);
  });
});
