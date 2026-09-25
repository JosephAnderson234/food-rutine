"use client";

import { CheckRow } from "@app/components/ui/CheckRow";
import { Chip } from "@app/components/ui/day";
import {
  useShopping,
  useToday,
  useUpdateSettings,
  useWeek,
} from "@app/data/hooks";
import {
  addDays,
  diffDays,
  startOfWeek,
  WEEKDAY_LONG,
  weekdayOf,
} from "@app/domain/dates";
import { formatQty, type ShoppingItem } from "@app/domain/shopping";
import { type FreezeRaw, planTrips, type Trip } from "@app/domain/trips";
import type { IngredientCategory } from "@app/domain/types";
import { formatDayMonth, formatWeekRange } from "@app/lib/format";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  Carrot,
  Drop,
  Egg,
  Grains,
  type Icon,
  Jar,
  Orange,
  Snowflake,
} from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";

const CATEGORY_ICON: Record<IngredientCategory, Icon> = {
  proteina: Egg,
  carbohidrato: Grains,
  verdura: Carrot,
  fruta: Orange,
  lacteo: Drop,
  basico: Jar,
};

const dayLabel = (date: string) =>
  `${WEEKDAY_LONG[weekdayOf(date)]} ${formatDayMonth(date)}`;

function TripsToggle({
  value,
  onChange,
}: {
  value: 1 | 2;
  onChange: (v: 1 | 2) => void;
}) {
  return (
    <fieldset className="grid grid-cols-2 rounded-full border border-line bg-panel p-1 text-sm">
      <legend className="sr-only">Cuántas compras</legend>
      {([1, 2] as const).map((n) => (
        <label
          key={n}
          className={`relative cursor-pointer rounded-full px-4 py-1.5 text-center font-medium has-focus-visible:ring-2 has-focus-visible:ring-accent ${value === n ? "text-panel" : "text-muted hover:text-text"}`}
        >
          <input
            type="radio"
            name="shopping-trips"
            className="sr-only"
            checked={value === n}
            onChange={() => onChange(n)}
          />
          {value === n && (
            <motion.span
              layoutId="trips-pill"
              className="absolute inset-0 rounded-full bg-text"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative">{n === 1 ? "1 compra" : "2 compras"}</span>
        </label>
      ))}
    </fieldset>
  );
}

function FreezeNotice({ item }: { item: FreezeRaw }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-frost-soft p-3 text-sm">
      <Snowflake
        size={18}
        weight="duotone"
        className="shrink-0 text-frost"
        aria-hidden
      />
      <span>
        <strong className="font-semibold">{item.name}:</strong> congélala cruda
        al llegar; crudo aguanta 1–2 días en refri. Pásala a la refri el{" "}
        {dayLabel(item.thawOn).toLowerCase()} en la noche para cocinarla el{" "}
        {WEEKDAY_LONG[weekdayOf(item.cookOn)].toLowerCase()}.
      </span>
    </p>
  );
}

function TripCard({
  trip,
  today,
  bought,
  onToggle,
}: {
  trip: Trip;
  today: string;
  bought: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const items = trip.list.groups.flatMap((g) => g.items);
  const key = (i: ShoppingItem) => `${trip.id}:${i.ingredientId}`;
  const done = items.filter((i) => bought.has(key(i))).length;
  const days = diffDays(today, trip.date);
  const when =
    days === 0
      ? "Hoy"
      : days === 1
        ? "Mañana"
        : days < 0
          ? "Ya pasó"
          : `En ${days} días`;
  const freezing = new Set(trip.freezeRaw.map((f) => f.ingredientId));

  return (
    <motion.section
      layout
      className="overflow-hidden rounded-3xl border border-line bg-panel"
    >
      <header className="space-y-2 px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              {when}
            </p>
            <h2 className="text-2xl font-semibold">{dayLabel(trip.date)}</h2>
            <p className="text-xs text-muted">
              Para: {trip.prepNames.join(" y ")}
            </p>
          </div>
          <span className="font-mono text-sm text-muted">
            {done}/{items.length}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-panel-2">
          <motion.div
            className="h-full rounded-full bg-good"
            animate={{
              width: `${items.length ? (done / items.length) * 100 : 100}%`,
            }}
          />
        </div>
      </header>

      <div className="space-y-4 px-4 pt-3 pb-4">
        {trip.freezeRaw.map((f) => (
          <FreezeNotice key={f.ingredientId} item={f} />
        ))}

        {items.length === 0 && (
          <p className="text-sm text-muted">
            Nada que comprar: ya tienes todo en casa.
          </p>
        )}

        {trip.list.groups.map((group) => {
          const Glyph = CATEGORY_ICON[group.category];
          return (
            <div key={group.category}>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <Glyph size={14} weight="duotone" aria-hidden />
                {group.label}
              </p>
              <ul className="divide-y divide-line">
                {group.items.map((item) => (
                  <li key={item.ingredientId}>
                    <CheckRow
                      checked={bought.has(key(item))}
                      onChange={(checked) => onToggle(key(item), checked)}
                      aside={
                        <span className="flex items-center gap-2">
                          {freezing.has(item.ingredientId) && (
                            <Chip className="bg-frost-soft text-frost">
                              <Snowflake
                                size={12}
                                weight="duotone"
                                aria-hidden
                              />
                              Congelar
                            </Chip>
                          )}
                          <span className="font-mono text-sm">
                            {item.display}
                          </span>
                        </span>
                      }
                    >
                      {item.name}
                    </CheckRow>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {trip.list.pantry.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Revisa que tengas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {trip.list.pantry.map((p) => (
                <Chip key={p.ingredientId} className="bg-panel-2 text-text">
                  {p.name}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function InventoryEditor({
  ingredients,
  inventory,
  onChange,
}: {
  ingredients: { id: string; name: string; unit: "g" | "ml" | "u" }[];
  inventory: Map<string, number>;
  onChange: (id: string, qty: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = ingredients.filter(
    (i) => (inventory.get(i.id) ?? 0) > 0,
  ).length;
  return (
    <section className="rounded-3xl border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div>
          <h2 className="text-lg font-semibold">¿Qué ya tienes en casa?</h2>
          <p className="text-xs text-muted">
            {count > 0
              ? `${count} ingredientes descontados de la lista`
              : "Anótalo y se descuenta de la lista"}
          </p>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          className="text-muted"
        >
          <CaretDown size={16} weight="bold" aria-hidden />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="divide-y divide-line overflow-hidden border-t border-line px-4"
          >
            {ingredients.map((ing) => {
              const value = inventory.get(ing.id) ?? 0;
              return (
                <li key={ing.id} className="flex items-center gap-3 py-2">
                  <label htmlFor={`inv-${ing.id}`} className="flex-1 text-sm">
                    {ing.name}
                  </label>
                  <input
                    id={`inv-${ing.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={ing.unit === "u" ? 1 : 50}
                    defaultValue={value || ""}
                    placeholder="0"
                    onBlur={(e) =>
                      onChange(ing.id, Number(e.target.value) || 0)
                    }
                    className="w-20 rounded-xl border border-line bg-panel-2 px-2 py-1.5 text-right font-mono text-sm focus:border-accent focus:outline-none"
                  />
                  <span className="w-6 text-xs text-muted">{ing.unit}</span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

const navBtn =
  "grid size-10 place-items-center rounded-full border border-line bg-panel text-muted hover:text-text";

export function ShoppingView() {
  const today = useToday();
  // El sábado lo útil es la compra de la semana que empieza mañana.
  const [offset, setOffset] = useState<number | null>(null);
  const baseOffset = today && weekdayOf(today) === 6 ? 1 : 0;
  const effective = offset ?? baseOffset;
  const weekStart = today ? addDays(startOfWeek(today), effective * 7) : null;
  const { data, error } = useWeek(weekStart);
  const shopping = useShopping(weekStart);
  const updateSettings = useUpdateSettings();

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-3xl border border-danger/40 bg-danger-soft p-4 text-sm"
      >
        No se pudo cargar la lista: {error.message}
      </div>
    );
  }
  if (!today || !weekStart || !data || !shopping.ready) {
    return (
      <div aria-busy="true" className="space-y-3">
        <output className="sr-only">Cargando lista…</output>
        <div className="h-10 w-48 animate-pulse rounded-xl bg-panel-2" />
        <div className="h-64 animate-pulse rounded-3xl bg-panel-2" />
      </div>
    );
  }

  const { plan, catalog, settings, templates } = data;
  const template = templates.get(plan.templateId);
  if (!template) return null;
  const tripsMode = settings.shoppingTrips ?? 2;
  const trips = planTrips({
    plan,
    template,
    catalog,
    settings,
    inventory: shopping.inventory,
    trips: tripsMode,
  });
  const neededIngredients = [
    ...new Set(
      planTrips({
        plan,
        template,
        catalog,
        settings,
        inventory: new Map(),
        trips: 1,
      })[0]?.list.groups.flatMap((g) => g.items.map((i) => i.ingredientId)) ??
        [],
    ),
  ].flatMap((id) => {
    const ing = catalog.ingredients.get(id);
    return ing ? [{ id, name: ing.name, unit: ing.unit }] : [];
  });

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              {template.name}
            </p>
            <h1 className="mt-1.5 text-5xl leading-[0.9] font-bold">Compras</h1>
            <p className="mt-1.5 font-mono text-sm text-muted">
              {formatWeekRange(weekStart)}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={navBtn}
              aria-label="Semana anterior"
              onClick={() => setOffset(effective - 1)}
            >
              <CaretLeft size={16} weight="bold" aria-hidden />
            </button>
            <button
              type="button"
              className={navBtn}
              aria-label="Semana siguiente"
              onClick={() => setOffset(effective + 1)}
            >
              <CaretRight size={16} weight="bold" aria-hidden />
            </button>
          </div>
        </header>

        <div className="space-y-2">
          <TripsToggle
            value={tripsMode}
            onChange={(n) => void updateSettings({ shoppingTrips: n })}
          />
          <p className="px-1 text-xs text-muted">
            {tripsMode === 2
              ? "Compras antes de cada meal prep: la carne llega fresca y no hay que congelarla cruda."
              : "Todo en una salida. Lo crudo que no aguanta hasta su prep se congela al llegar."}
          </p>
        </div>

        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            today={today}
            bought={shopping.bought}
            onToggle={shopping.toggleBought}
          />
        ))}

        <InventoryEditor
          key={weekStart}
          ingredients={neededIngredients}
          inventory={shopping.inventory}
          onChange={shopping.setHave}
        />

        <p className="px-1 text-xs text-muted">
          Cantidades redondeadas hacia arriba a lo que se puede comprar (
          {formatQty(50, "g")} en carnes y verduras, unidades enteras en huevos
          y panes).
        </p>
      </div>
    </MotionConfig>
  );
}
