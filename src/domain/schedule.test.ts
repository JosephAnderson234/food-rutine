import { FIXED_COURSES } from "@app/data/seed";
import { describe, expect, it } from "vitest";
import {
  campusSpan,
  expandFixedCourses,
  findSlot,
  lunchAtCampus,
  modalityFromLocation,
} from "./schedule";
import type { ScheduleEvent } from "./types";

const events = expandFixedCourses(FIXED_COURSES, "2026-09-27");
const lunch = { from: "12:00", to: "14:30" };

describe("modalidad", () => {
  it("un link es virtual; un aula es presencial", () => {
    expect(modalityFromLocation("https://utec.zoom.us/j/84944767128")).toBe(
      "virtual",
    );
    expect(modalityFromLocation("A708")).toBe("presencial");
    expect(modalityFromLocation(undefined)).toBe("presencial");
  });
});

describe("campus", () => {
  it("lunes: de CPD (9:00) a Economía (16:00); ML es por Zoom", () => {
    expect(campusSpan(events, "2026-09-28")).toEqual({
      from: "09:00",
      to: "16:00",
    });
  });

  it("jueves: solo ML virtual, no hay que ir", () => {
    expect(campusSpan(events, "2026-10-01")).toBeNull();
    expect(lunchAtCampus(events, "2026-10-01", lunch)).toBe(false);
  });

  it("viernes: EDA 13–15 cruza el almuerzo", () => {
    expect(lunchAtCampus(events, "2026-10-02", lunch)).toBe(true);
  });
});

describe("findSlot", () => {
  it("usa la hora preferida si está libre", () => {
    const slot = findSlot(events, {
      date: "2026-09-28",
      durationMin: 120,
      window: { from: "07:00", to: "22:00" },
      preferredStart: "17:00",
    });
    expect(slot).toEqual({ start: "17:00", end: "19:00" });
  });

  it("esquiva un curso fijo moviéndose hacia adelante", () => {
    const slot = findSlot(events, {
      date: "2026-09-29",
      durationMin: 90,
      window: { from: "07:00", to: "22:00" },
      preferredStart: "16:00",
    });
    expect(slot).toEqual({ start: "19:00", end: "20:30" });
  });

  it("los eventos flexibles bloquean salvo que se pida ignorarlos", () => {
    const repaso: ScheduleEvent = {
      id: "r",
      title: "Repaso",
      date: "2026-10-01",
      start: "15:00",
      end: "17:00",
      kind: "flexible",
      source: "app",
    };
    const q = {
      date: "2026-10-01",
      durationMin: 120,
      window: { from: "15:00", to: "17:00" },
    };
    expect(findSlot([...events, repaso], q)).toBeNull();
    expect(
      findSlot([...events, repaso], { ...q, includeFlexible: false }),
    ).toEqual({ start: "15:00", end: "17:00" });
  });

  it("null si la ventana es más corta que la duración", () => {
    expect(
      findSlot(events, {
        date: "2026-10-01",
        durationMin: 120,
        window: { from: "15:00", to: "16:00" },
      }),
    ).toBeNull();
  });
});
