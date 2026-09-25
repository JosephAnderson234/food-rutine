"use client";

import { CheckRow } from "@app/components/ui/CheckRow";
import { Chip } from "@app/components/ui/day";
import { FoodGlyph } from "@app/components/ui/icons";
import { useCook, useToday, useWeek } from "@app/data/hooks";
import {
  buildCook,
  type CookView as Cook,
  type CookStep,
  liveStatus,
  prepSessions,
} from "@app/domain/cook";
import {
  addDays,
  diffDays,
  formatDuration,
  startOfWeek,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  weekdayOf,
} from "@app/domain/dates";
import type { EquipmentId } from "@app/domain/types";
import { formatDayMonth } from "@app/lib/format";
import {
  ArrowCounterClockwise,
  BookOpenText,
  CaretRight,
  Check,
  CookingPot,
  Fire,
  Knife,
  Play,
  Snowflake,
  ThermometerHot,
  ThermometerSimple,
  Timer,
} from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { GuideMode } from "./GuideMode";

const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  arrocera: "Arrocera",
  wok: "Wok",
  sarten: "Sartén",
  microondas: "Microondas",
};

const STORAGE = {
  refri: {
    label: "Refri",
    icon: ThermometerSimple,
    className: "bg-panel-2 text-muted",
  },
  congelador: {
    label: "Congelador",
    icon: Snowflake,
    className: "bg-frost-soft text-frost",
  },
  servir: {
    label: "Se come hoy",
    icon: Fire,
    className: "bg-accent-soft text-accent",
  },
} as const;

/** Barra de tiempo: tramo activo sólido y espera pasiva rayada, sobre el total de la sesión. */
function TimeBar({ step, total }: { step: CookStep; total: number }) {
  const pct = (m: number) => `${(m / total) * 100}%`;
  return (
    <span
      aria-hidden
      className="relative mt-1.5 block h-1.5 rounded-full bg-panel-2"
    >
      <span
        className="absolute inset-y-0 rounded-full bg-accent"
        style={{
          left: pct(step.start),
          width: pct(step.activeEnd - step.start),
        }}
      />
      {step.end > step.activeEnd && (
        <span
          className="absolute inset-y-0 rounded-full bg-[repeating-linear-gradient(135deg,var(--accent)_0_3px,transparent_3px_6px)] opacity-50"
          style={{
            left: pct(step.activeEnd),
            width: pct(step.end - step.activeEnd),
          }}
        />
      )}
    </span>
  );
}

function StepMeta({ step }: { step: CookStep }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {step.equipment && (
        <Chip className="bg-panel-2 text-muted">
          {EQUIPMENT_LABEL[step.equipment]}
        </Chip>
      )}
      {step.batch && (
        <Chip className="bg-accent-soft text-accent">
          Tanda{" "}
          <span className="font-mono">
            {step.batch.n}/{step.batch.of}
          </span>
        </Chip>
      )}
      {step.end > step.activeEnd && (
        <Chip className="bg-panel-2 text-muted">
          <Timer size={12} weight="duotone" aria-hidden />
          {formatDuration(step.end - step.activeEnd)} solo
        </Chip>
      )}
      {step.safeTempC && (
        <Chip className="bg-danger-soft text-danger">
          <ThermometerHot size={12} weight="duotone" aria-hidden />
          {step.safeTempC} °C por dentro
        </Chip>
      )}
    </span>
  );
}

function LivePanel({
  cook,
  elapsedMin,
  done,
  onDone,
  onOpenGuide,
}: {
  cook: Cook;
  elapsedMin: number;
  done: Set<string>;
  onDone: (id: string) => void;
  onOpenGuide: () => void;
}) {
  const live = liveStatus(cook, elapsedMin, done);
  if (live.finished) {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-good-soft p-4">
        <span className="grid size-11 place-items-center rounded-2xl bg-good text-panel">
          <Check size={22} weight="bold" aria-hidden />
        </span>
        <div>
          <p className="font-heading text-lg font-semibold">
            Listo en {formatDuration(elapsedMin)}
          </p>
          <p className="text-sm text-muted">
            Tapa y guarda todo pronto: refri o congelador dentro de 2 h.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4 rounded-3xl bg-text p-4 text-bg">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-70">
        <span>
          En marcha ·{" "}
          <span className="font-mono">{formatDuration(elapsedMin)}</span>
        </span>
        {live.behindMin > 0 && (
          <span className="rounded-full bg-bg/15 px-2 py-0.5 normal-case tracking-normal">
            {live.behindMin} min atrás
          </span>
        )}
      </div>

      {live.now.length > 0 ? (
        live.now.map((step) => (
          <motion.div
            key={step.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg/10">
              {step.icon ? (
                <FoodGlyph icon={step.icon} size={24} />
              ) : (
                <Knife size={24} weight="duotone" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg leading-snug font-semibold">
                {step.label}
              </p>
              <p className="text-xs opacity-70">
                {step.componentName ?? "Final"}
                {step.batch && ` · tanda ${step.batch.n} de ${step.batch.of}`}
                {step.safeTempC && ` · ${step.safeTempC} °C por dentro`}
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={() => onDone(step.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg px-3.5 py-2 text-xs font-semibold text-text"
            >
              <Check size={14} weight="bold" aria-hidden />
              Hecho
            </motion.button>
          </motion.div>
        ))
      ) : (
        <p className="text-sm opacity-80">
          Nada activo ahora
          {live.next ? `: lo siguiente empieza a las ${live.next.at}.` : "."}
        </p>
      )}

      {live.running.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-bg/15 pt-3">
          {live.running.map(({ step, remainingMin }) => (
            <span
              key={step.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-bg/10 px-3 py-1 text-xs"
            >
              <Timer size={14} weight="duotone" aria-hidden />
              {step.equipment
                ? EQUIPMENT_LABEL[step.equipment]
                : step.componentName}
              : <span className="font-mono">{remainingMin} min</span>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onOpenGuide}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-bg py-2.5 text-sm font-semibold text-text"
      >
        <BookOpenText size={18} weight="duotone" aria-hidden />
        Abrir guía paso a paso
      </button>
      {live.next && live.now.length > 0 && (
        <p className="text-xs opacity-70">
          Después: {live.next.label}{" "}
          <span className="font-mono">({live.next.at})</span>
        </p>
      )}
    </div>
  );
}

function CookSession({ cook, today }: { cook: Cook; today: string }) {
  const { session } = cook;
  const state = useCook(session.date, session.refId);
  const total = cook.plan.totalMin;
  const stored = cook.containers.filter((c) => c.containerNo !== null).length;
  const daysAway = diffDays(today, session.date);
  const [guideAt, setGuideAt] = useState<number | null>(null);
  const firstPending = Math.max(
    0,
    cook.steps.findIndex((s) => !state.done.has(s.id)),
  );
  const openGuide = (at = firstPending) => {
    if (!state.startedAt) state.start();
    setGuideAt(at);
  };

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {guideAt !== null && (
          <GuideMode
            cook={cook}
            done={state.done}
            timers={state.timers}
            startIndex={guideAt}
            elapsedMin={state.elapsedMin}
            onToggle={state.toggle}
            onTimer={state.setTimer}
            onClose={() => setGuideAt(null)}
          />
        )}
      </AnimatePresence>
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {daysAway === 0
            ? "Hoy"
            : daysAway === 1
              ? "Mañana"
              : WEEKDAY_LONG[weekdayOf(session.date)]}{" "}
          · {formatDayMonth(session.date)}
        </p>
        <h1 className="text-4xl leading-[0.95] font-bold">{session.title}</h1>
        <p className="font-mono text-sm text-muted">
          {session.start}–{session.end} · {formatDuration(total)} · {stored}{" "}
          táperes
        </p>
        <div className="flex flex-wrap gap-1.5">
          {cook.equipment.map((e) => (
            <Chip key={e} className="bg-panel-2 text-muted">
              <CookingPot size={12} weight="duotone" aria-hidden />
              {EQUIPMENT_LABEL[e]}
            </Chip>
          ))}
        </div>
      </header>

      {state.startedAt && state.elapsedMin !== null ? (
        <LivePanel
          cook={cook}
          elapsedMin={state.elapsedMin}
          done={state.done}
          onDone={(id) => state.toggle(id, true)}
          onOpenGuide={() => openGuide()}
        />
      ) : (
        <section className="space-y-3">
          <h2 className="px-1 text-xl font-semibold">
            Antes de encender el fuego
          </h2>
          <ul className="divide-y divide-line rounded-3xl border border-line bg-panel px-4">
            {cook.before.map((item, i) => (
              <li key={item}>
                <CheckRow
                  checked={state.done.has(`before:${i}`)}
                  onChange={(c) => state.toggle(`before:${i}`, c)}
                >
                  {item}
                </CheckRow>
              </li>
            ))}
          </ul>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => openGuide(0)}
            disabled={!state.ready}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 font-semibold text-panel disabled:opacity-50"
          >
            <Play size={18} weight="fill" aria-hidden />
            Empezar con la guía paso a paso
          </motion.button>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-xl font-semibold">Pasos</h2>
          <span className="font-mono text-xs text-muted">
            {cook.steps.filter((s) => state.done.has(s.id)).length}/
            {cook.steps.length}
          </span>
        </div>
        <ol className="divide-y divide-line rounded-3xl border border-line bg-panel px-4">
          {cook.steps.map((step, i) => (
            <li key={step.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <CheckRow
                  checked={state.done.has(step.id)}
                  onChange={(c) => state.toggle(step.id, c)}
                  aside={
                    <span className="self-start pt-0.5 font-mono text-xs text-muted">
                      {step.at}
                    </span>
                  }
                >
                  <span className="block">{step.label}</span>
                  <StepMeta step={step} />
                  <TimeBar step={step} total={total} />
                </CheckRow>
              </div>
              <button
                type="button"
                onClick={() => openGuide(i)}
                aria-label={`Abrir en la guía: ${step.label}`}
                className="mt-2.5 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-text"
              >
                <CaretRight size={16} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xl font-semibold">Armado de táperes</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {cook.containers.map((c) => {
            const st = STORAGE[c.storage];
            return (
              <li
                key={c.portionId}
                className="flex gap-3 rounded-3xl border border-line bg-panel p-3.5"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-panel-2 font-heading text-lg font-bold">
                  {c.containerNo ?? <FoodGlyph icon={c.icon} size={22} />}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">{c.assemblyName}</p>
                  <p className="text-xs text-muted">
                    {WEEKDAY_SHORT[weekdayOf(c.eatOn)]} {c.slot}
                    {c.size === "grande" && " · porción grande"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip className={st.className}>
                      <st.icon size={12} weight="duotone" aria-hidden />
                      {st.label}
                    </Chip>
                    {c.containerNo !== null && (
                      <span className="rounded-md border border-dashed border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {c.tag}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-xs text-muted">
          Reparte en táperes poco profundos, deja salir el vapor unos minutos y
          refrigera antes de las{" "}
          <span className="font-mono">{cook.coolBy}</span> (2 h después del fin
          planificado). No cierres una olla grande caliente dentro de la refri.
        </p>
      </section>

      {state.startedAt && (
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "¿Reiniciar esta sesión? Se desmarcan todos los pasos.",
              )
            )
              state.reset();
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-danger"
        >
          <ArrowCounterClockwise size={14} weight="bold" aria-hidden />
          Reiniciar sesión
        </button>
      )}
    </div>
  );
}

export function CookView() {
  const today = useToday();
  const weekStart = today ? startOfWeek(today) : null;
  const nextStart = weekStart ? addDays(weekStart, 7) : null;
  const current = useWeek(weekStart);
  const next = useWeek(nextStart);
  const [picked, setPicked] = useState<string | null>(null);

  const error = current.error ?? next.error;
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-3xl border border-danger/40 bg-danger-soft p-4 text-sm"
      >
        No se pudo cargar el meal prep: {error.message}
      </div>
    );
  }
  if (!today || !current.data || !next.data) {
    return (
      <div aria-busy="true" className="space-y-3">
        <output className="sr-only">Cargando…</output>
        <div className="h-12 w-64 animate-pulse rounded-xl bg-panel-2" />
        <div className="h-72 animate-pulse rounded-3xl bg-panel-2" />
      </div>
    );
  }

  const options = [current.data, next.data].flatMap((d) =>
    prepSessions(d.plan)
      .filter((s) => diffDays(today, s.date) >= -1)
      .map((s) => ({
        id: `${d.plan.weekStart}:${s.refId}`,
        session: s,
        data: d,
      })),
  );
  const upcoming =
    options.find((o) => diffDays(today, o.session.date) >= 0) ?? options[0];
  const selected = options.find((o) => o.id === picked) ?? upcoming;
  if (!selected)
    return <p className="text-sm text-muted">No hay meal prep planificado.</p>;

  const cook = buildCook(
    selected.data.plan,
    selected.data.catalog,
    selected.session.refId,
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-5">
        <nav
          aria-label="Sesiones"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {options.map((o) => {
            const active = o.id === selected.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPicked(o.id)}
                className={`relative shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium ${active ? "border-transparent text-panel" : "border-line bg-panel text-muted hover:text-text"}`}
              >
                {active && (
                  <motion.span
                    layoutId="session-pill"
                    className="absolute inset-0 rounded-full bg-text"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">
                  {WEEKDAY_SHORT[weekdayOf(o.session.date)]}{" "}
                  {formatDayMonth(o.session.date)}
                </span>
              </button>
            );
          })}
        </nav>
        <CookSession key={selected.id} cook={cook} today={today} />
      </div>
    </MotionConfig>
  );
}
