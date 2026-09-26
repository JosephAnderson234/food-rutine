import { addDays, type ISODate, startOfWeek } from "@app/domain/dates";
import {
  cookScope,
  timerReminders,
  upcoming,
  weekReminders,
} from "@app/domain/reminders";
import type { AuthedApi } from "@app/integrations/backend/api";
import type { MealPrepDB } from "../db";
import { readWeek, timersOn } from "../repo";

/**
 * Manda al backend los avisos de esta semana, de la próxima y de los temporizadores de
 * cocina de hoy. El backend reemplaza cada grupo de forma idempotente.
 */
export async function pushReminders(
  db: MealPrepDB,
  api: Pick<AuthedApi, "replaceReminders">,
  today: ISODate,
  timeZone: string,
  now = Date.now(),
): Promise<number> {
  let total = 0;
  const weekStart = startOfWeek(today);
  for (const ws of [weekStart, addDays(weekStart, 7)]) {
    const plan = await readWeek(db, ws);
    if (!plan) continue;
    const list = upcoming(weekReminders(plan, timeZone), now);
    await api.replaceReminders(ws, list);
    total += list.length;
  }

  const components = await db.components.toArray();
  const timers = (await timersOn(db, today)).map((t) => {
    const [compId] = t.stepId.split(":");
    return {
      ...t,
      label: components.find((c) => c.id === compId)?.name ?? "Temporizador",
    };
  });
  const cook = timerReminders(timers, now);
  await api.replaceReminders(cookScope(today), cook);
  return total + cook.length;
}
