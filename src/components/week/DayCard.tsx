"use client";

import { Chip, MealTags, ModeChip, SLOT_LABEL } from "@app/components/ui/day";
import {
  FoodGlyph,
  MODE_ICONS,
  TASK_ICONS,
  TASK_TONE,
} from "@app/components/ui/icons";
import type { DayView, MealView } from "@app/domain/week-view";
import { formatKcal } from "@app/lib/format";
import { CaretDown } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

function MealRow({ meal }: { meal: MealView }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${meal.name ? "bg-panel text-text" : "bg-transparent text-muted/50"}`}
      >
        <FoodGlyph icon={meal.icon} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
          {SLOT_LABEL[meal.slot]}
        </p>
        <p className={`text-sm ${meal.name ? "" : "text-muted"}`}>
          {meal.name ?? "Libre"}
        </p>
        <div className="mt-1.5">
          <MealTags meal={meal} />
        </div>
      </div>
      {meal.nutrition && (
        <span className="shrink-0 pt-4 font-mono text-[11px] text-muted">
          {formatKcal(meal.nutrition.kcal)}
        </span>
      )}
    </li>
  );
}

export function DayCard({ day }: { day: DayView }) {
  const [open, setOpen] = useState(!day.isPast);
  const panelId = `day-${day.date}`;
  const dayNumber = Number(day.date.slice(8));

  return (
    <motion.article
      layout="position"
      className={`overflow-hidden rounded-3xl border bg-panel ${
        day.isToday
          ? "border-accent/60 shadow-[0_0_0_4px_var(--accent-soft)]"
          : "border-line"
      } ${day.isPast ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left"
      >
        <span
          className={`w-10 shrink-0 font-heading text-3xl leading-none font-semibold ${day.isToday ? "text-accent" : ""}`}
        >
          {dayNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg leading-tight font-semibold">
              {day.dayName}
            </h2>
            {day.isToday && <Chip className="bg-accent text-panel">Hoy</Chip>}
          </div>
          {!open && day.agenda.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              {day.agenda.map((t) => {
                const Glyph = TASK_ICONS[t.kind];
                return (
                  <span
                    key={t.id}
                    title={t.label}
                    className={`grid size-5 place-items-center rounded-md ${TASK_TONE[t.kind]}`}
                  >
                    <Glyph size={12} weight="bold" aria-hidden />
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <ModeChip day={day} />
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted"
        >
          <CaretDown size={16} weight="bold" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="space-y-4 border-t border-line px-4 pt-4 pb-4">
              {day.agenda.length > 0 && (
                <ol className="space-y-2.5">
                  {day.agenda.map((task) => {
                    const Glyph = TASK_ICONS[task.kind];
                    return (
                      <li key={task.id} className="flex items-start gap-3">
                        <span className="w-11 shrink-0 pt-1 font-mono text-xs text-muted">
                          {task.time ?? "—"}
                        </span>
                        <span
                          className={`grid size-7 shrink-0 place-items-center rounded-lg ${TASK_TONE[task.kind]}`}
                        >
                          <Glyph size={16} weight="duotone" aria-hidden />
                        </span>
                        <span className="pt-0.5 text-sm">{task.label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}

              <ul className="divide-y divide-line rounded-2xl bg-panel-2 px-3">
                {day.meals.map((meal) => (
                  <MealRow key={meal.slot} meal={meal} />
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                {day.total.kcal > 0 ? (
                  <span className="font-mono">
                    ≈ {formatKcal(day.total.kcal)} · {day.total.proteinG} g
                    proteína
                  </span>
                ) : (
                  <span />
                )}
                {day.courses.length > 0 && (
                  <details>
                    <summary className="cursor-pointer list-none hover:text-text">
                      {day.courses.length}{" "}
                      {day.courses.length === 1 ? "clase" : "clases"} ›
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {day.courses.map((c) => {
                        const Glyph =
                          MODE_ICONS[
                            c.modality === "virtual" ? "virtual" : "campus"
                          ];
                        return (
                          <li key={c.id} className="flex items-center gap-1.5">
                            <Glyph size={12} weight="duotone" aria-hidden />
                            <span className="font-mono">
                              {c.start}–{c.end}
                            </span>
                            {c.title}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
