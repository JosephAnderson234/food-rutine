import { describe, expect, it } from "vitest";
import {
  addDays,
  diffDays,
  formatDuration,
  fromMinutes,
  minutesIn,
  startOfWeek,
  todayIn,
  toMinutes,
  weekdayOf,
} from "./dates";

describe("dates", () => {
  it("suma días cruzando meses y años", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("calcula el día de la semana (0 = domingo)", () => {
    expect(weekdayOf("2026-09-27")).toBe(0);
    expect(weekdayOf("2026-10-01")).toBe(4);
  });

  it("encuentra el domingo de la semana", () => {
    expect(startOfWeek("2026-10-01")).toBe("2026-09-27");
    expect(startOfWeek("2026-09-27")).toBe("2026-09-27");
    expect(startOfWeek("2026-10-03")).toBe("2026-09-27");
  });

  it("diferencia de días", () => {
    expect(diffDays("2026-09-27", "2026-09-30")).toBe(3);
    expect(diffDays("2026-09-30", "2026-09-27")).toBe(-3);
  });

  it("convierte horas y duraciones", () => {
    expect(toMinutes("17:30")).toBe(1050);
    expect(fromMinutes(1050)).toBe("17:30");
    expect(formatDuration(98)).toBe("1 h 38 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(45)).toBe("45 min");
  });

  it("usa la fecha civil de Lima, no la UTC", () => {
    // 02:00 UTC del 1/10 = 21:00 del 30/9 en Lima
    expect(todayIn("America/Lima", new Date("2026-10-01T02:00:00Z"))).toBe(
      "2026-09-30",
    );
  });

  it("minutos del día en Lima", () => {
    expect(minutesIn("America/Lima", new Date("2026-10-01T02:30:00Z"))).toBe(
      21 * 60 + 30,
    );
  });
});
