"use client";

import { CheckRow } from "@app/components/ui/CheckRow";
import { Chip, MealTags, ModeChip, SLOT_LABEL } from "@app/components/ui/day";
import {
  FoodGlyph,
  TASK_ICONS,
  TASK_SHORT,
  TASK_TONE,
} from "@app/components/ui/icons";
import {
  useDayChecks,
  useNow,
  usePortionAction,
  useToday,
  useWeek,
} from "@app/data/hooks";
import {
  addDays,
  formatDuration,
  startOfWeek,
  weekdayOf,
} from "@app/domain/dates";
import type { PackingItem } from "@app/domain/packing";
import {
  canApply,
  type PortionAction,
  type PortionAlert,
} from "@app/domain/safety";
import {
  buildToday,
  isTaskDone,
  type MealWithActions,
  taskCheckKey,
  taskPortionAction,
} from "@app/domain/today";
import type { Portion } from "@app/domain/types";
import { formatDayMonth, formatKcal } from "@app/lib/format";
import {
  Backpack,
  Check,
  Drop,
  type Icon,
  Info,
  Snowflake,
  ThermometerSimple,
  Trash,
  Tray,
  WarningCircle,
  WarningOctagon,
} from "@phosphor-icons/react";
import { MotionConfig, motion } from "motion/react";

const ACTION: Record<
  PortionAction,
  { label: string; icon: Icon; className: string }
> = {
  thaw: {
    label: "Pasar a la refri",
    icon: Drop,
    className: "bg-frost-soft text-frost",
  },
  pack: {
    label: "Empacar",
    icon: Backpack,
    className: "bg-warn-soft text-warn",
  },
  eat: { label: "Comido", icon: Check, className: "bg-good text-panel" },
  freeze: {
    label: "Congelar",
    icon: Snowflake,
    className: "bg-frost-soft text-frost",
  },
  discard: {
    label: "Descartar",
    icon: Trash,
    className: "text-muted hover:text-danger",
  },
};

const ALERT_STYLE: Record<
  PortionAlert["level"],
  { icon: Icon; className: string }
> = {
  danger: {
    icon: WarningOctagon,
    className: "border-danger/40 bg-danger-soft text-danger",
  },
  warn: {
    icon: WarningCircle,
    className: "border-warn/40 bg-warn-soft text-warn",
  },
  info: { icon: Info, className: "border-frost/30 bg-frost-soft text-frost" },
};

const FROM: Record<
  NonNullable<PackingItem["from"]>,
  { label: string; icon: Icon }
> = {
  refri: { label: "Refri", icon: ThermometerSimple },
  congelador: { label: "Congelador", icon: Snowflake },
  cajón: { label: "Cajón", icon: Tray },
};

function relative(min: number): string {
  if (min <= 0) return "Ahora";
  return `En ${formatDuration(min)}`;
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ActionButton({
  action,
  onClick,
}: {
  action: PortionAction;
  onClick: () => void;
}) {
  const { label, icon: Glyph, className } = ACTION[action];
  const quiet = action === "discard";
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full text-xs font-semibold ${quiet ? "px-2 py-2" : "px-3.5 py-2"} ${className}`}
    >
      <Glyph size={15} weight={quiet ? "regular" : "bold"} aria-hidden />
      {label}
    </motion.button>
  );
}

function confirmDiscard(label: string): boolean {
  return window.confirm(`¿Descartar "${label}"? No se puede deshacer.`);
}

function MealCard({
  meal,
  onAction,
}: {
  meal: MealWithActions;
  onAction: (portionId: string, action: PortionAction) => void;
}) {
  const portionId = meal.portion?.id;
  return (
    <motion.li layout className="rounded-3xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${meal.name ? "bg-panel-2" : "text-muted/50"}`}
        >
          <FoodGlyph icon={meal.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            {SLOT_LABEL[meal.slot]}
          </p>
          <p className={meal.name ? "font-medium" : "text-muted"}>
            {meal.name ?? "Libre"}
          </p>
          <MealTags meal={meal} />
        </div>
        {meal.nutrition && (
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {formatKcal(meal.nutrition.kcal)}
          </span>
        )}
      </div>
      {portionId && meal.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {meal.actions.map((action) => (
            <ActionButton
              key={action}
              action={action}
              onClick={() => {
                if (action === "discard" && !confirmDiscard(meal.name ?? ""))
                  return;
                onAction(portionId, action);
              }}
            />
          ))}
        </div>
      )}
    </motion.li>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <output className="sr-only">Cargando…</output>
      <div className="h-10 w-40 animate-pulse rounded-xl bg-panel-2" />
      <div className="h-24 animate-pulse rounded-3xl bg-panel-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl bg-panel-2" />
      ))}
    </div>
  );
}

export function TodayView() {
  const today = useToday();
  const now = useNow();
  const weekStart = today ? startOfWeek(today) : null;
  const nextStart =
    today && weekStart && weekdayOf(today) === 6 ? addDays(weekStart, 7) : null;
  const current = useWeek(weekStart);
  const next = useWeek(nextStart);
  const { checks, toggle } = useDayChecks(today);
  const act = usePortionAction();

  const error = current.error ?? next.error;
  if (error) {
    return (
      <div
        role="alert"
        className="rounded-3xl border border-danger/40 bg-danger-soft p-4 text-sm"
      >
        No se pudo cargar el día: {error.message}
      </div>
    );
  }
  if (!today || now === null || !current.data || (nextStart && !next.data)) {
    return <Skeleton />;
  }

  const { plan, events, catalog, settings } = current.data;
  const view = buildToday({
    plan,
    events,
    catalog,
    settings,
    today,
    nowMin: now,
    nextPlan: next.data?.plan,
    nextEvents: next.data?.events,
  });
  const portions = new Map<string, Portion>(
    plan.portions.map((p) => [p.id, p]),
  );
  const onAction = (id: string, action: PortionAction) => {
    void act(id, action);
  };

  const lunchPortionId = view.meals.find((m) => m.slot === "almuerzo")?.portion
    ?.id;
  const packPortion =
    view.packing && lunchPortionId ? portions.get(lunchPortionId) : undefined;
  const packDone = (item: PackingItem) =>
    item.id === "taper" && packPortion
      ? !canApply(packPortion.state, "pack")
      : checks.has(`pack:${item.id}`);
  const packCount = view.packing?.items.filter(packDone).length ?? 0;

  const nextTask = view.next;
  const NextGlyph = nextTask ? TASK_ICONS[nextTask.task.kind] : Check;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-7">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {view.day.dayName} · {formatDayMonth(today)}
            </p>
            <h1 className="mt-1.5 text-5xl leading-[0.9] font-bold">Hoy</h1>
          </div>
          <ModeChip day={view.day} />
        </header>

        <motion.div
          key={nextTask?.task.id ?? "none"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-4 rounded-3xl p-4 ${nextTask ? "bg-text text-bg" : "border border-line bg-panel"}`}
        >
          <span
            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${nextTask ? "bg-bg/10" : "bg-good-soft text-good"}`}
          >
            <NextGlyph size={26} weight="duotone" aria-hidden />
          </span>
          {nextTask ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
                {relative(nextTask.inMin)} ·{" "}
                <span className="font-mono">{nextTask.task.time}</span>
              </p>
              <p className="mt-0.5 font-heading text-lg leading-snug font-semibold">
                {nextTask.task.label}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No queda nada con hora en la agenda de hoy.
            </p>
          )}
        </motion.div>

        {view.alerts.length > 0 && (
          <div className="space-y-2">
            {view.alerts.map((a) => {
              const { icon: Glyph, className } = ALERT_STYLE[a.level];
              return (
                <p
                  key={a.message}
                  className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${className}`}
                >
                  <Glyph
                    size={18}
                    weight="duotone"
                    className="shrink-0"
                    aria-hidden
                  />
                  <span className="text-text">{a.message}</span>
                </p>
              );
            })}
          </div>
        )}

        {view.pending.length > 0 && (
          <Section title="Sin marcar">
            <ul className="divide-y divide-line rounded-3xl border border-line bg-panel px-4">
              {view.pending.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 py-3"
                >
                  <span className="min-w-0 flex-1 text-sm">{p.label}</span>
                  <ActionButton
                    action="eat"
                    onClick={() => onAction(p.id, "eat")}
                  />
                  <ActionButton
                    action="discard"
                    onClick={() =>
                      confirmDiscard(p.label) && onAction(p.id, "discard")
                    }
                  />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="Comidas"
          aside={
            view.day.total.kcal > 0 && (
              <span className="font-mono text-xs text-muted">
                ≈ {formatKcal(view.day.total.kcal)} · {view.day.total.proteinG}{" "}
                g prot.
              </span>
            )
          }
        >
          <ul className="space-y-2.5">
            {view.meals.map((meal) => (
              <MealCard key={meal.slot} meal={meal} onAction={onAction} />
            ))}
          </ul>
        </Section>

        {view.packing && (
          <Section
            title="Mochila"
            aside={
              <span className="font-mono text-xs text-muted">
                {packCount}/{view.packing.items.length}
              </span>
            }
          >
            <div className="rounded-3xl border border-line bg-panel px-4 py-1">
              <div className="h-1 overflow-hidden rounded-full bg-panel-2 mt-3">
                <motion.div
                  className="h-full rounded-full bg-good"
                  animate={{
                    width: `${(packCount / view.packing.items.length) * 100}%`,
                  }}
                />
              </div>
              <ul className="divide-y divide-line">
                {view.packing.items.map((item) => {
                  const done = packDone(item);
                  const from = item.from && FROM[item.from];
                  const isTaper = item.id === "taper" && packPortion;
                  return (
                    <li key={item.id}>
                      <CheckRow
                        checked={done}
                        disabled={Boolean(isTaper && done)}
                        onChange={(checked) => {
                          if (isTaper) {
                            if (checked) onAction(packPortion.id, "pack");
                          } else toggle(`pack:${item.id}`, checked);
                        }}
                        aside={
                          from && (
                            <Chip className="bg-panel-2 text-muted">
                              <from.icon
                                size={12}
                                weight="duotone"
                                aria-hidden
                              />
                              {from.label}
                            </Chip>
                          )
                        }
                      >
                        {item.label}
                      </CheckRow>
                    </li>
                  );
                })}
              </ul>
            </div>
            <ul className="space-y-1 px-1 text-xs text-muted">
              {view.packing.reminders.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {packPortion && (
                <li>
                  Al empacar el táper, esa porción ya no vuelve a la refri.
                </li>
              )}
            </ul>
          </Section>
        )}

        {view.day.agenda.length > 0 && (
          <Section title="Agenda">
            <ul className="divide-y divide-line rounded-3xl border border-line bg-panel px-4">
              {view.day.agenda.map((task) => {
                const portion = task.portionId
                  ? portions.get(task.portionId)
                  : undefined;
                const done = isTaskDone(task, portion, checks);
                const action = taskPortionAction(task);
                const Glyph = TASK_ICONS[task.kind];
                const locked = Boolean(action && portion && done);
                return (
                  <li key={task.id}>
                    <CheckRow
                      checked={done}
                      disabled={locked}
                      onChange={(checked) => {
                        if (action && portion) {
                          if (checked && canApply(portion.state, action))
                            onAction(portion.id, action);
                        } else toggle(taskCheckKey(task), checked);
                      }}
                      aside={
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted">
                            {task.time ?? ""}
                          </span>
                          <span
                            className={`grid size-7 place-items-center rounded-lg ${TASK_TONE[task.kind]}`}
                          >
                            <Glyph size={16} weight="duotone" aria-hidden />
                          </span>
                        </span>
                      }
                    >
                      {task.label}
                    </CheckRow>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {view.tomorrow && (
          <Section title="Mañana">
            <div className="space-y-3 rounded-3xl border border-dashed border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {view.tomorrow.day.dayName}{" "}
                  <span className="text-muted">
                    {formatDayMonth(view.tomorrow.day.date)}
                  </span>
                </p>
                <ModeChip day={view.tomorrow.day} />
              </div>
              {view.tomorrow.lunch ? (
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-panel-2">
                    <FoodGlyph icon={view.tomorrow.lunch.icon} size={22} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm">
                      {view.tomorrow.lunch.where === "u"
                        ? "Almuerzo en la U: "
                        : "Almuerzo en casa: "}
                      {view.tomorrow.lunch.name}
                    </p>
                    <MealTags meal={view.tomorrow.lunch} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Almuerzo libre.</p>
              )}
              {view.tomorrow.day.agenda.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {view.tomorrow.day.agenda.map((t) => {
                    const Glyph = TASK_ICONS[t.kind];
                    return (
                      <Chip key={t.id} className={TASK_TONE[t.kind]}>
                        <Glyph size={12} weight="duotone" aria-hidden />
                        {t.time && <span className="font-mono">{t.time}</span>}
                        {TASK_SHORT[t.kind]}
                      </Chip>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </MotionConfig>
  );
}
