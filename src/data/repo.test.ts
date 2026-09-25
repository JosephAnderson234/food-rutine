import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MealPrepDB } from "./db";
import {
  actOnPortion,
  addManualEvents,
  boughtFor,
  checksFor,
  cookState,
  getOrCreateWeek,
  inventoryMap,
  regenerateWeek,
  removeManualEvent,
  resetCook,
  saveCalendarCache,
  seedIfEmpty,
  setBought,
  setCheck,
  setInventory,
  timerKey,
  updateSettings,
  weekEvents,
} from "./repo";

let db: MealPrepDB;
let n = 0;

beforeEach(async () => {
  db = new MealPrepDB(`test-${n++}`);
  await seedIfEmpty(db);
});

afterEach(async () => {
  await db.delete();
});

describe("repo", () => {
  it("siembra una sola vez", async () => {
    expect(await seedIfEmpty(db)).toBe(false);
    expect(await db.fixedCourses.count()).toBe(14);
  });

  it("genera la semana, la guarda y la devuelve igual", async () => {
    const first = await getOrCreateWeek(db, "2026-09-27");
    expect(first.portions).toHaveLength(11);
    const again = await getOrCreateWeek(db, "2026-09-27");
    expect(again.sessions).toEqual(first.sessions);
    expect(again.portions.map((p) => p.id).sort()).toEqual(
      first.portions.map((p) => p.id).sort(),
    );
  });

  it("guarda el estado de las porciones", async () => {
    const plan = await getOrCreateWeek(db, "2026-09-27");
    const frozen = plan.portions.find((p) => p.state === "frozen");
    if (!frozen) throw new Error("se esperaba una porción congelada");
    await actOnPortion(db, frozen.id, "thaw");
    const reloaded = await getOrCreateWeek(db, "2026-09-27");
    expect(reloaded.portions.find((p) => p.id === frozen.id)?.state).toBe(
      "thawing",
    );
  });

  it("rechaza transiciones inválidas", async () => {
    const plan = await getOrCreateWeek(db, "2026-09-27");
    const fridge = plan.portions.find((p) => p.state === "fridge");
    if (!fridge) throw new Error("se esperaba una porción en refri");
    await expect(actOnPortion(db, fridge.id, "thaw")).rejects.toThrow();
  });

  it("recalcular conserva lo que ya se hizo con la comida cocinada", async () => {
    const plan = await getOrCreateWeek(db, "2026-09-27");
    const lunes = plan.portions.find(
      (p) => p.eatOn === "2026-09-28" && p.slot === "almuerzo",
    );
    if (!lunes) throw new Error("falta lunes");
    await actOnPortion(db, lunes.id, "pack");
    const again = await regenerateWeek(db, "2026-09-27", "2026-09-28");
    expect(again.portions.find((p) => p.id === lunes.id)?.state).toBe("packed");
    expect((await db.portions.get(lunes.id))?.state).toBe("packed");
  });

  it("regenerar reemplaza las porciones de esa semana", async () => {
    await getOrCreateWeek(db, "2026-09-27");
    await regenerateWeek(db, "2026-09-27");
    expect(
      await db.portions.where("weekStart").equals("2026-09-27").count(),
    ).toBe(11);
  });

  it("inventario: set y borrar con 0", async () => {
    await setInventory(db, "huevo", 6);
    expect((await inventoryMap(db)).get("huevo")).toBe(6);
    await setInventory(db, "huevo", 0);
    expect((await inventoryMap(db)).has("huevo")).toBe(false);
  });

  it("casillas del día: marcar, leer por fecha y desmarcar", async () => {
    await setCheck(db, "2026-09-28", "pack:gel1", true);
    await setCheck(db, "2026-09-28", "task:x", true);
    await setCheck(db, "2026-09-29", "pack:gel1", true);
    expect([...(await checksFor(db, "2026-09-28"))].sort()).toEqual([
      "pack:gel1",
      "task:x",
    ]);
    await setCheck(db, "2026-09-28", "pack:gel1", false);
    expect([...(await checksFor(db, "2026-09-28"))]).toEqual(["task:x"]);
  });

  it("compras marcadas por semana", async () => {
    await setBought(db, "2026-09-27", "trip-2026-09-27:pollo", true);
    await setBought(db, "2026-10-04", "trip-2026-10-04:pollo", true);
    expect([...(await boughtFor(db, "2026-09-27"))]).toEqual([
      "trip-2026-09-27:pollo",
    ]);
    await setBought(db, "2026-09-27", "trip-2026-09-27:pollo", false);
    expect((await boughtFor(db, "2026-09-27")).size).toBe(0);
  });

  it("actualiza la configuración sin pisar el resto", async () => {
    await updateSettings(db, { shoppingTrips: 1 });
    const s = await db.settings.get("default");
    expect(s?.shoppingTrips).toBe(1);
    expect(s?.rotation).toEqual(["A"]);
  });

  it("sesión de cocina: inicio, pasos y reinicio", async () => {
    await setCheck(db, "2026-09-27", "cook:prep-dom:start", true);
    await setCheck(db, "2026-09-27", "cook:prep-dom:pollo:cortar", true);
    await setCheck(db, "2026-09-27", "cook:prep-mie:start", true);
    const st = await cookState(db, "2026-09-27", "prep-dom");
    expect(st.startedAt).not.toBeNull();
    expect([...st.done]).toEqual(["pollo:cortar"]);
    await resetCook(db, "2026-09-27", "prep-dom");
    expect(
      (await cookState(db, "2026-09-27", "prep-dom")).startedAt,
    ).toBeNull();
    expect(
      (await cookState(db, "2026-09-27", "prep-mie")).startedAt,
    ).not.toBeNull();
  });

  it("temporizadores con ids de paso que tienen ':'", async () => {
    await setCheck(
      db,
      "2026-09-27",
      `cook:prep-dom:${timerKey("pollo:saltear#2", 8)}`,
      true,
    );
    const st = await cookState(db, "2026-09-27", "prep-dom");
    expect(st.timers).toEqual([
      { stepId: "pollo:saltear#2", minutes: 8, startedAt: expect.any(Number) },
    ]);
    expect(st.done.size).toBe(0);
  });

  it("usa los eventos de Google si la semana está sincronizada; si no, los cursos locales", async () => {
    expect(await weekEvents(db, "2026-09-27")).toHaveLength(14);
    await saveCalendarCache(db, "2026-09-27", [
      {
        id: "g:utec:1",
        title: "Machine Learning",
        date: "2026-09-28",
        start: "07:00",
        end: "09:00",
        kind: "fixed",
        modality: "virtual",
        source: "google",
      },
    ]);
    const events = await weekEvents(db, "2026-09-27");
    expect(events.map((e) => e.id)).toEqual(["g:utec:1"]);
    expect(await weekEvents(db, "2026-10-04")).toHaveLength(14);
  });

  it("un compromiso agregado mueve el gym y al quitarlo vuelve", async () => {
    await getOrCreateWeek(db, "2026-09-27");
    const plan = await addManualEvents(db, "2026-09-27", [
      {
        id: "ai:1",
        title: "Parcial",
        date: "2026-10-01",
        start: "14:00",
        end: "18:00",
        kind: "flexible",
        source: "app",
      },
    ]);
    const gym = (p: typeof plan) =>
      p.sessions.find((s) => s.kind === "gym" && s.date === "2026-10-01")
        ?.start;
    expect(gym(plan)).toBe("18:00");
    expect(
      (await weekEvents(db, "2026-09-27")).some((e) => e.id === "ai:1"),
    ).toBe(true);
    const back = await removeManualEvent(db, "2026-09-27", "ai:1");
    expect(gym(back)).toBe("15:00");
  });
});
