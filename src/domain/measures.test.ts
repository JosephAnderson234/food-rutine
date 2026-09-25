import { describe, expect, it } from "vitest";
import { catalog } from "../test/fixtures";
import { formatFraction, formatKitchen } from "./measures";

const ing = (id: string) => {
  const i = catalog.ingredients.get(id);
  if (!i) throw new Error(id);
  return i;
};

describe("formatFraction", () => {
  it("usa fracciones de cocina", () => {
    expect(formatFraction(0.25)).toBe("¼");
    expect(formatFraction(1.5)).toBe("1½");
    expect(formatFraction(2)).toBe("2");
    expect(formatFraction(0.9)).toBe("1");
  });
});

describe("formatKitchen", () => {
  it("sal y especias en cucharaditas o cucharadas", () => {
    expect(formatKitchen(ing("sal"), 2.5)).toBe("½ cdta");
    expect(formatKitchen(ing("sal"), 5.6)).toBe("1 cdta");
    expect(formatKitchen(ing("comino"), 2.8)).toBe("1 cdta");
    expect(formatKitchen(ing("aceite"), 28)).toBe("2 cda");
    expect(formatKitchen(ing("pimienta"), 0.2)).toBe("una pizca");
  });

  it("carnes y verduras en gramos redondeados", () => {
    expect(formatKitchen(ing("pollo"), 283.4)).toBe("285 g");
    expect(formatKitchen(ing("ajo"), 7.2)).toBe("7 g");
    expect(formatKitchen(ing("arroz"), 1120)).toBe("1.12 kg");
  });

  it("unidades", () => {
    expect(formatKitchen(ing("huevo"), 1)).toBe("1 unidad");
    expect(formatKitchen(ing("huevo"), 3)).toBe("3 unidades");
  });
});
