"use client";

import { Check } from "@phosphor-icons/react";
import { motion } from "motion/react";

/** Checkbox nativo (accesible) con apariencia propia. */
export function CheckRow({
  checked,
  onChange,
  disabled,
  children,
  aside,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-3 py-2.5 ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={`grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
          checked ? "border-good bg-good text-panel" : "border-line bg-panel"
        }`}
      >
        {checked && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 600, damping: 25 }}
          >
            <Check size={14} weight="bold" />
          </motion.span>
        )}
      </span>
      <span
        className={`min-w-0 flex-1 text-sm transition-colors ${checked ? "text-muted line-through decoration-muted/60" : ""}`}
      >
        {children}
      </span>
      {aside}
    </label>
  );
}
