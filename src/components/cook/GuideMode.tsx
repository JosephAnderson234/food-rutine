"use client";

import { Chip } from "@app/components/ui/day";
import { FoodGlyph } from "@app/components/ui/icons";
import {
  type CookStep,
  type CookView,
  type TimerState,
  timerViews,
} from "@app/domain/cook";
import { formatDuration } from "@app/domain/dates";
import type { EquipmentId, Heat } from "@app/domain/types";
import { ring, useWakeLock } from "@app/lib/device";
import {
  ArrowLeft,
  ArrowRight,
  BellRinging,
  Check,
  CheckCircle,
  Eye,
  Fire,
  Knife,
  Lightbulb,
  ThermometerHot,
  Timer,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  arrocera: "Arrocera",
  wok: "Wok",
  sarten: "Sartén",
  microondas: "Microondas",
};

const HEAT_LEVEL: Record<Heat, number> = {
  bajo: 1,
  medio: 2,
  "medio-alto": 3,
  alto: 4,
};

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function HeatMeter({ heat }: { heat: Heat }) {
  const level = HEAT_LEVEL[heat];
  return (
    <div className="flex items-center gap-2">
      <div className="flex" role="img" aria-label={`Fuego ${heat}`}>
        {[1, 2, 3, 4].map((n) => (
          <Fire
            key={n}
            size={20}
            weight={n <= level ? "fill" : "regular"}
            className={n <= level ? "text-accent" : "text-muted/40"}
            aria-hidden
          />
        ))}
      </div>
      <span className="text-sm font-medium capitalize">Fuego {heat}</span>
    </div>
  );
}

function StepBody({ step }: { step: CookStep }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="grid size-9 place-items-center rounded-xl bg-panel-2 text-text">
            {step.icon ? (
              <FoodGlyph icon={step.icon} size={20} />
            ) : (
              <Knife size={20} weight="duotone" aria-hidden />
            )}
          </span>
          <span className="font-medium text-text">
            {step.componentName ?? "Final"}
          </span>
          {step.batch && (
            <Chip className="bg-accent-soft text-accent">
              Tanda{" "}
              <span className="font-mono">
                {step.batch.n} de {step.batch.of}
              </span>
            </Chip>
          )}
          {step.equipment && (
            <Chip className="bg-panel-2 text-muted">
              {EQUIPMENT_LABEL[step.equipment]}
            </Chip>
          )}
        </div>
        <h2 className="text-[2rem] leading-[1.05] font-bold">{step.label}</h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {step.heat && <HeatMeter heat={step.heat} />}
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Timer size={18} weight="duotone" aria-hidden />
            {formatDuration(step.activeEnd - step.start)}
            {step.end > step.activeEnd &&
              ` + ${formatDuration(step.end - step.activeEnd)} de espera`}
          </span>
        </div>
      </div>

      {step.amounts.length > 0 && (
        <section className="rounded-3xl border border-line bg-panel p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {step.batch ? "Para esta tanda" : "Vas a usar"}
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
            {step.amounts.map((a) => (
              <li
                key={a.ingredientId}
                className="flex items-baseline justify-between gap-2 border-b border-dashed border-line pb-1"
              >
                <span className="text-sm">{a.name}</span>
                <span className="font-mono text-sm font-medium">
                  {a.display}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step.details.length > 0 && (
        <ol className="space-y-3">
          {step.details.map((d, i) => (
            <li key={d} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-text font-mono text-xs font-semibold text-bg">
                {i + 1}
              </span>
              <p className="pt-0.5 text-[17px] leading-snug">{d}</p>
            </li>
          ))}
        </ol>
      )}

      {(step.cue || step.safeTempC) && (
        <section className="flex gap-3 rounded-3xl bg-good-soft p-4">
          <Eye
            size={22}
            weight="duotone"
            className="shrink-0 text-good"
            aria-hidden
          />
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-good">
              Listo cuando
            </p>
            {step.cue && <p className="leading-snug">{step.cue}</p>}
            {step.safeTempC && (
              <Chip className="bg-danger-soft text-danger">
                <ThermometerHot size={12} weight="duotone" aria-hidden />
                {step.safeTempC} °C en el centro
              </Chip>
            )}
          </div>
        </section>
      )}

      {step.tip && (
        <section className="flex gap-3 rounded-3xl bg-accent-soft p-4">
          <Lightbulb
            size={22}
            weight="duotone"
            className="shrink-0 text-accent"
            aria-hidden
          />
          <p className="leading-snug">{step.tip}</p>
        </section>
      )}
    </div>
  );
}

export function GuideMode({
  cook,
  done,
  timers,
  startIndex,
  elapsedMin,
  onToggle,
  onTimer,
  onClose,
}: {
  cook: CookView;
  done: Set<string>;
  timers: TimerState[];
  startIndex: number;
  elapsedMin: number | null;
  onToggle: (stepId: string, checked: boolean) => void;
  onTimer: (stepId: string, minutes: number, on: boolean) => void;
  onClose: () => void;
}) {
  const steps = cook.steps;
  const [index, setIndex] = useState(startIndex);
  const [direction, setDirection] = useState(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const alerted = useRef(new Set<string>());
  useWakeLock(true);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const views = timerViews(timers, steps, nowMs);
  useEffect(() => {
    for (const t of timers) {
      const key = `${t.stepId}:${t.minutes}`;
      const overdueMs = nowMs - (t.startedAt + t.minutes * 60_000);
      if (overdueMs < 0 || alerted.current.has(key)) continue;
      alerted.current.add(key);
      // Solo suena si terminó hace poco: al reabrir la guía no suenan avisos viejos.
      if (overdueMs < 2 * 60_000) ring();
    }
  });

  const go = (to: number) => {
    setDirection(to > index ? 1 : -1);
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  };
  const nextPending = (from: number) => {
    for (let i = from + 1; i < steps.length; i++)
      if (!done.has(steps[i].id)) return i;
    for (let i = 0; i < steps.length; i++)
      if (!done.has(steps[i].id) && i !== from) return i;
    return -1;
  };

  const step = steps[index];
  const isDone = done.has(step.id);
  const waitMin = step.end - step.activeEnd;
  const activeMin = step.activeEnd - step.start;
  const ownTimer = timers.find(
    (t) => t.stepId === step.id && t.minutes === activeMin,
  );
  const ownView = ownTimer && views.find((v) => v.stepId === step.id);
  const allDone = steps.every((s) => done.has(s.id));
  const upcomingIndex = nextPending(index);
  const upcoming = upcomingIndex >= 0 ? steps[upcomingIndex] : undefined;

  const markDone = () => {
    onToggle(step.id, true);
    if (waitMin > 0) onTimer(step.id, waitMin, true);
    const n = nextPending(index);
    if (n >= 0) go(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Modo guía"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="fixed inset-0 z-50 flex flex-col bg-bg"
    >
      <header className="space-y-3 border-b border-line px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía"
            className="grid size-10 place-items-center rounded-full border border-line bg-panel"
          >
            <X size={18} weight="bold" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Paso {index + 1} de {steps.length}
              {elapsedMin !== null && (
                <span className="font-mono">
                  {" "}
                  · {formatDuration(elapsedMin)}
                </span>
              )}
            </p>
            <div className="mt-1.5 flex gap-0.5">
              {steps.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Ir al paso ${i + 1}: ${s.label}`}
                  onClick={() => go(i)}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === index
                      ? "bg-accent"
                      : done.has(s.id)
                        ? "bg-good"
                        : "bg-panel-2"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        {views.length > 0 && (
          <div className="mx-auto flex max-w-2xl flex-wrap gap-1.5">
            {views.map((v) => (
              <motion.span
                key={v.stepId}
                layout
                animate={v.done ? { scale: [1, 1.06, 1] } : {}}
                transition={
                  v.done
                    ? { repeat: Number.POSITIVE_INFINITY, duration: 1 }
                    : {}
                }
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  v.done ? "bg-danger text-panel" : "bg-text text-bg"
                }`}
              >
                {v.done ? (
                  <BellRinging size={14} weight="fill" aria-hidden />
                ) : (
                  <Timer size={14} weight="duotone" aria-hidden />
                )}
                {v.label}{" "}
                <span className="font-mono">
                  {v.done ? "¡listo!" : clock(v.remainingSec)}
                </span>
                {v.done && (
                  <button
                    type="button"
                    className="ml-1 rounded-full bg-panel/25 px-1.5"
                    onClick={() => {
                      const t = timers.find((x) => x.stepId === v.stepId);
                      if (t) onTimer(t.stepId, t.minutes, false);
                    }}
                  >
                    OK
                  </button>
                )}
              </motion.span>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {allDone ? (
            <div className="space-y-4 py-10 text-center">
              <CheckCircle
                size={72}
                weight="duotone"
                className="mx-auto text-good"
                aria-hidden
              />
              <h2 className="text-4xl font-bold">Meal prep listo</h2>
              <p className="text-muted">
                Todo guardado antes de las{" "}
                <span className="font-mono">{cook.coolBy}</span>. Buen trabajo.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-text px-6 py-3 font-semibold text-bg"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={step.id}
                custom={direction}
                initial={{ opacity: 0, x: 40 * direction }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 * direction }}
                transition={{ duration: 0.2 }}
              >
                <StepBody step={step} />
                {upcoming && (
                  <button
                    type="button"
                    onClick={() => go(steps.indexOf(upcoming))}
                    className="mt-8 flex w-full items-center gap-3 rounded-3xl border border-dashed border-line p-4 text-left text-sm text-muted hover:text-text"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      Después
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {upcoming.label}
                      {upcoming.batch &&
                        ` · tanda ${upcoming.batch.n}/${upcoming.batch.of}`}
                    </span>
                    <ArrowRight size={16} weight="bold" aria-hidden />
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {!allDone && (
        <footer className="border-t border-line bg-bg/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Paso anterior"
              className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-panel disabled:opacity-40"
            >
              <ArrowLeft size={20} weight="bold" aria-hidden />
            </button>

            {activeMin >= 3 && !isDone && (
              <button
                type="button"
                onClick={() => onTimer(step.id, activeMin, !ownTimer)}
                className={`flex h-12 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${
                  ownTimer
                    ? "border-transparent bg-text text-bg"
                    : "border-line bg-panel"
                }`}
              >
                <Timer size={18} weight="duotone" aria-hidden />
                {ownView ? (
                  <span className="font-mono">
                    {clock(ownView.remainingSec)}
                  </span>
                ) : (
                  `${activeMin} min`
                )}
              </button>
            )}

            {isDone ? (
              <button
                type="button"
                onClick={() => onToggle(step.id, false)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-good-soft font-semibold text-good"
              >
                <Check size={18} weight="bold" aria-hidden />
                Hecho · desmarcar
              </button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={markDone}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-panel"
              >
                <Check size={18} weight="bold" aria-hidden />
                {waitMin > 0
                  ? `Hecho · avísame en ${formatDuration(waitMin)}`
                  : "Hecho"}
              </motion.button>
            )}

            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === steps.length - 1}
              aria-label="Paso siguiente"
              className="grid size-12 shrink-0 place-items-center rounded-full border border-line bg-panel disabled:opacity-40"
            >
              <ArrowRight size={20} weight="bold" aria-hidden />
            </button>
          </div>
        </footer>
      )}
    </motion.div>
  );
}
