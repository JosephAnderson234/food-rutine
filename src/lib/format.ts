import { addDays, type ISODate } from "@app/domain/dates";

const dayMonth = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const noon = (date: ISODate) => new Date(`${date}T12:00:00Z`);

/** "28 sep" */
export function formatDayMonth(date: ISODate): string {
  return dayMonth.format(noon(date)).replace(".", "");
}

/** "27 sep – 3 oct" */
export function formatWeekRange(weekStart: ISODate): string {
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(addDays(weekStart, 6))}`;
}

export function formatKcal(kcal: number): string {
  return `${Math.round(kcal).toLocaleString("es-PE")} kcal`;
}
