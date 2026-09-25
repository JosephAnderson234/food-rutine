"use client";

import { applyInventory, useAi } from "@app/data/use-ai";
import { type InventoryPreview, previewInventory } from "@app/domain/ai";
import type { Catalog } from "@app/domain/catalog";
import { formatKitchen } from "@app/domain/measures";
import {
  ArrowRight,
  ArrowsClockwise,
  Check,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";

/** "Compré 1 kg de pollo y me quedan 5 huevos" → vista previa → confirmar. */
export function InventoryAssistant({
  catalog,
  inventory,
}: {
  catalog: Catalog;
  inventory: Map<string, number>;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{
    rows: InventoryPreview[];
    unknown: string[];
    summary: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const ai = useAi();

  const ingredients = [...catalog.ingredients.values()]
    .filter((i) => !i.pantry)
    .map(({ id, name, unit }) => ({ id, name, unit }));

  const submit = async () => {
    if (!text.trim()) return;
    const out = await ai.askInventory(ingredients, text);
    if (out) {
      setPreview({
        rows: previewInventory(inventory, out, catalog),
        unknown: out.unknown,
        summary: out.summary,
      });
    }
  };

  const show = (id: string, qty: number) => {
    const ing = catalog.ingredients.get(id);
    return ing ? (qty === 0 ? "0" : formatKitchen(ing, qty)) : String(qty);
  };

  return (
    <section className="space-y-3 rounded-3xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <Sparkle
          size={18}
          weight="duotone"
          className="text-accent"
          aria-hidden
        />
        <h2 className="text-lg font-semibold">Dilo con tus palabras</h2>
      </div>

      {!preview ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="inv-text" className="sr-only">
            Qué compraste o qué te queda
          </label>
          <textarea
            id="inv-text"
            rows={2}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej.: compré 1 kg de pollo y una docena de huevos; se acabó el arroz"
            className="w-full resize-none rounded-2xl border border-line bg-panel-2 px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={ai.busy || !text.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-text py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {ai.busy && (
              <ArrowsClockwise size={16} className="animate-spin" aria-hidden />
            )}
            {ai.busy ? "Pensando…" : "Actualizar lo que tengo"}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          {preview.summary && <p className="text-sm">{preview.summary}</p>}
          {preview.rows.length > 0 ? (
            <ul className="divide-y divide-line rounded-2xl border border-line px-3">
              {preview.rows.map((r) => (
                <li
                  key={r.ingredientId}
                  className="flex items-center gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {show(r.ingredientId, r.before)}
                  </span>
                  <ArrowRight
                    size={12}
                    weight="bold"
                    className="text-muted"
                    aria-hidden
                  />
                  <span className="font-mono text-xs font-semibold">
                    {show(r.ingredientId, r.after)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No reconocí ingredientes del catálogo.
            </p>
          )}
          {preview.unknown.length > 0 && (
            <p className="text-xs text-muted">
              No están en el catálogo: {preview.unknown.join(", ")}.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="flex-1 rounded-full border border-line py-2.5 text-sm font-medium"
            >
              Corregir
            </button>
            <button
              type="button"
              disabled={saving || preview.rows.length === 0}
              onClick={async () => {
                setSaving(true);
                try {
                  await applyInventory(preview.rows);
                  setPreview(null);
                  setText("");
                } finally {
                  setSaving(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-sm font-semibold text-panel disabled:opacity-50"
            >
              <Check size={16} weight="bold" aria-hidden />
              {saving ? "Guardando…" : "Aplicar"}
            </button>
          </div>
        </div>
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
    </section>
  );
}
