"use client";

import { WeekAssistant } from "@app/components/assistant/WeekAssistant";
import { useToday, useWeek } from "@app/data/hooks";
import { addDays, formatDuration, startOfWeek } from "@app/domain/dates";
import { buildDayViews, summarizeWeek } from "@app/domain/week-view";
import { formatWeekRange } from "@app/lib/format";
import {
  ArrowsClockwise,
  Backpack,
  Barbell,
  CaretLeft,
  CaretRight,
  CookingPot,
  GearSix,
  type Icon,
  Snowflake,
  WarningCircle,
} from "@phosphor-icons/react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { DayCard } from "./DayCard";

function Stat({
  icon: Glyph,
  tone,
  value,
  label,
}: {
  icon: Icon;
  tone: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-line bg-panel p-3">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-2xl ${tone}`}
      >
        <Glyph size={22} weight="duotone" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-heading text-xl leading-tight font-semibold">
          {value}
        </p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <output className="sr-only">Cargando semana…</output>
      <div className="h-10 w-64 animate-pulse rounded-xl bg-panel-2" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-3xl bg-panel-2" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-3xl bg-panel-2" />
      ))}
    </div>
  );
}

const navBtn =
  "grid size-10 place-items-center rounded-full border border-line bg-panel text-muted hover:text-text";

export function WeekView() {
  const today = useToday();
  const [offset, setOffset] = useState(0);
  const weekStart = today ? addDays(startOfWeek(today), offset * 7) : null;
  const { data, error, regenerate } = useWeek(weekStart);
  const [regenerating, setRegenerating] = useState(false);

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-3xl border border-danger/40 bg-danger-soft p-4 text-sm"
      >
        <WarningCircle
          size={18}
          weight="duotone"
          className="shrink-0 text-danger"
          aria-hidden
        />
        No se pudo cargar la semana: {error.message}
      </div>
    );
  }
  if (!today || !weekStart || !data) return <Skeleton />;

  const { plan, events, catalog, settings, templates, manual } = data;
  const days = buildDayViews(plan, events, catalog, settings, today);
  const summary = summarizeWeek(plan);
  const templateName = templates.get(plan.templateId)?.name ?? plan.templateId;

  // Recalcular conserva lo ya cocinado (carryOver): no hace falta confirmar.
  const onRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerate();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {templateName}
            </p>
            <h1 className="mt-1.5 text-4xl leading-[0.95] font-bold">
              {offset === 0
                ? "Esta es tu semana"
                : offset === 1
                  ? "La próxima semana"
                  : "Semana"}
            </h1>
            <p className="mt-1.5 font-mono text-sm text-muted">
              {formatWeekRange(weekStart)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/ajustes" aria-label="Ajustes" className={navBtn}>
              <GearSix size={16} weight="bold" aria-hidden />
            </Link>
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              className={navBtn}
              aria-label="Semana anterior"
              onClick={() => setOffset((o) => o - 1)}
            >
              <CaretLeft size={16} weight="bold" aria-hidden />
            </motion.button>
            {offset !== 0 && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                className="h-10 rounded-full border border-line bg-panel px-3.5 text-xs font-medium text-muted hover:text-text"
                onClick={() => setOffset(0)}
              >
                Hoy
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              className={navBtn}
              aria-label="Semana siguiente"
              onClick={() => setOffset((o) => o + 1)}
            >
              <CaretRight size={16} weight="bold" aria-hidden />
            </motion.button>
          </div>
        </header>

        <WeekAssistant
          key={`assistant-${weekStart}`}
          weekStart={weekStart}
          today={today}
          events={events}
          manual={manual}
        />

        <section
          aria-label="Resumen"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          <Stat
            icon={CookingPot}
            tone="bg-accent-soft text-accent"
            value={formatDuration(summary.prepMinutes)}
            label={`${summary.preps} sesiones de prep`}
          />
          <Stat
            icon={Barbell}
            tone="bg-good-soft text-good"
            value={`${summary.gyms}×`}
            label="Gym"
          />
          <Stat
            icon={Backpack}
            tone="bg-warn-soft text-warn"
            value={`${summary.lunchesAtU}`}
            label="Almuerzos en la U"
          />
          <Stat
            icon={Snowflake}
            tone="bg-frost-soft text-frost"
            value={`${summary.frozen}`}
            label="Al congelador"
          />
        </section>

        {plan.warnings.length > 0 && (
          <section
            aria-label="Avisos"
            className="space-y-1.5 rounded-3xl border border-warn/40 bg-warn-soft p-4 text-sm"
          >
            {plan.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2">
                <WarningCircle
                  size={18}
                  weight="duotone"
                  className="shrink-0 text-warn"
                  aria-hidden
                />
                {w}
              </p>
            ))}
          </section>
        )}

        <motion.section
          key={`days-${weekStart}`}
          aria-label="Días"
          className="space-y-3"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        >
          {days.map((day) => (
            <motion.div
              key={day.date}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
            >
              <DayCard day={day} />
            </motion.div>
          ))}
        </motion.section>

        <footer className="flex flex-col items-start gap-3 border-t border-line pt-5 text-xs text-muted">
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3.5 py-2 text-text hover:border-muted disabled:opacity-50"
          >
            <ArrowsClockwise
              size={14}
              weight="bold"
              className={regenerating ? "animate-spin" : ""}
              aria-hidden
            />
            {regenerating ? "Recalculando…" : "Recalcular semana"}
          </motion.button>
          <p className="max-w-prose">
            Calorías y proteína son solo referencia (Tablas Peruanas, aprox.).
            Seguridad alimentaria según USDA FSIS: refri ≤{" "}
            {settings.safety.fridgeMaxDays} días, refrigerar dentro de 2 h.
          </p>
        </footer>
      </div>
    </MotionConfig>
  );
}
