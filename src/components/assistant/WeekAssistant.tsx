"use client";

import { applyBlocks, removeBlock, useAi } from "@app/data/use-ai";
import {
  type ValidBlocks,
  validateBlocks,
  type WeekBlocks,
  weekContext,
} from "@app/domain/ai";
import { type ISODate, WEEKDAY_LONG, weekdayOf } from "@app/domain/dates";
import type { ScheduleEvent } from "@app/domain/types";
import { formatDayMonth } from "@app/lib/format";
import {
  ArrowsClockwise,
  CalendarPlus,
  Check,
  Question,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

const dayLabel = (date: ISODate) =>
  `${WEEKDAY_LONG[weekdayOf(date)]} ${formatDayMonth(date)}`;

function BlockRow({
  e,
  onRemove,
}: {
  e: ScheduleEvent;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        <CalendarPlus size={16} weight="duotone" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.title}</p>
        <p className="font-mono text-xs text-muted">
          {dayLabel(e.date)} · {e.start}–{e.end}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${e.title}`}
          className="grid size-8 place-items-center rounded-full text-muted hover:bg-panel-2 hover:text-danger"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      )}
    </li>
  );
}

/**
 * "Tengo parcial el jueves…" → la IA propone bloques ocupados → al aplicar,
 * el motor reubica gym y meal prep conservando lo ya cocinado.
 */
export function WeekAssistant({
  weekStart,
  today,
  events,
  manual,
}: {
  weekStart: ISODate;
  today: ISODate;
  events: ScheduleEvent[];
  manual: ScheduleEvent[];
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<(WeekBlocks & ValidBlocks) | null>(
    null,
  );
  const [applying, setApplying] = useState(false);
  const ai = useAi();

  const submit = async () => {
    if (!text.trim()) return;
    const base = events.filter((e) => !manual.some((m) => m.id === e.id));
    const out = await ai.askWeek(
      weekContext(weekStart, today, [...base, ...manual]),
      text,
    );
    if (out) setProposal({ ...out, ...validateBlocks(out, weekStart) });
  };

  const apply = async () => {
    if (!proposal) return;
    setApplying(true);
    try {
      await applyBlocks(weekStart, proposal.events);
      setProposal(null);
      setText("");
    } finally {
      setApplying(false);
    }
  };

  return (
    <section
      data-tour="assistant"
      className="overflow-hidden rounded-3xl border border-line bg-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Sparkle size={20} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">¿Cambió algo esta semana?</p>
          <p className="truncate text-xs text-muted">
            {manual.length > 0
              ? `${manual.length} compromiso${manual.length > 1 ? "s" : ""} agregado${manual.length > 1 ? "s" : ""}`
              : "Cuéntalo y reacomodo gym y meal prep"}
          </p>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-line p-4">
              {!proposal && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                >
                  <label htmlFor="week-text" className="sr-only">
                    Qué cambió
                  </label>
                  <textarea
                    id="week-text"
                    rows={3}
                    maxLength={1000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ej.: tengo parcial de ML el jueves de 10 a 12 y trabajo grupal el martes en la noche"
                    className="w-full resize-none rounded-2xl border border-line bg-panel-2 px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={ai.busy || !text.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-text py-3 text-sm font-semibold text-bg disabled:opacity-50"
                  >
                    {ai.busy ? (
                      <ArrowsClockwise
                        size={16}
                        className="animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <Sparkle size={16} weight="fill" aria-hidden />
                    )}
                    {ai.busy ? "Pensando…" : "Proponer cambios"}
                  </button>
                </form>
              )}

              {ai.error && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm"
                >
                  <WarningCircle
                    size={18}
                    weight="duotone"
                    className="shrink-0 text-danger"
                    aria-hidden
                  />
                  {ai.error}
                </p>
              )}

              {proposal && (
                <div className="space-y-3">
                  <p className="text-sm">{proposal.summary}</p>
                  {proposal.events.length > 0 ? (
                    <ul className="divide-y divide-line rounded-2xl border border-line px-3">
                      {proposal.events.map((e) => (
                        <BlockRow key={e.id} e={e} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">
                      No encontré compromisos con fecha y hora.
                    </p>
                  )}
                  {proposal.rejected.length > 0 && (
                    <p className="text-xs text-muted">
                      Descartado (fuera de esta semana u horas inválidas):{" "}
                      {proposal.rejected.join(", ")}
                    </p>
                  )}
                  {proposal.questions.map((q) => (
                    <p
                      key={q}
                      className="flex items-start gap-2 rounded-2xl bg-warn-soft p-3 text-sm"
                    >
                      <Question
                        size={18}
                        weight="duotone"
                        className="shrink-0 text-warn"
                        aria-hidden
                      />
                      {q}
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setProposal(null)}
                      className="flex-1 rounded-full border border-line py-2.5 text-sm font-medium"
                    >
                      Corregir
                    </button>
                    <button
                      type="button"
                      disabled={applying || proposal.events.length === 0}
                      onClick={() => void apply()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-sm font-semibold text-panel disabled:opacity-50"
                    >
                      <Check size={16} weight="bold" aria-hidden />
                      {applying ? "Reacomodando…" : "Aplicar"}
                    </button>
                  </div>
                </div>
              )}

              {manual.length > 0 && (
                <div className="space-y-1 border-t border-line pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Agregados esta semana
                  </p>
                  <ul className="divide-y divide-line">
                    {manual.map((e) => (
                      <BlockRow
                        key={e.id}
                        e={e}
                        onRemove={() => void removeBlock(weekStart, e.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-muted">
                El asistente (Groq) solo traduce tu texto a horarios; el plan lo
                recalcula la app. Lo ya cocinado no cambia.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
