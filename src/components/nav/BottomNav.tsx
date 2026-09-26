"use client";

import {
  Basket,
  CalendarDots,
  CookingPot,
  type Icon,
  Sun,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; icon: Icon; ready: boolean }[] = [
  { href: "/semana", label: "Semana", icon: CalendarDots, ready: true },
  { href: "/hoy", label: "Hoy", icon: Sun, ready: true },
  { href: "/compras", label: "Compras", icon: Basket, ready: true },
  { href: "/cocina", label: "Cocina", icon: CookingPot, ready: true },
];

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/bienvenida") return null;
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(env(safe-area-inset-bottom),12px)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[22px] border border-line bg-panel/85 p-1.5 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)] backdrop-blur-xl">
        {ITEMS.map(({ href, label, icon: Glyph, ready }) => {
          const active = pathname.startsWith(href);
          const inner = (
            <>
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-2xl bg-accent-soft"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <Glyph
                size={22}
                weight={active ? "fill" : "duotone"}
                aria-hidden
                className="relative"
              />
              <span className="relative">{label}</span>
            </>
          );
          const base =
            "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium";
          return (
            <li key={href}>
              {ready ? (
                <Link
                  href={href}
                  data-tour={`nav-${href.slice(1)}`}
                  aria-current={active ? "page" : undefined}
                  className={`${base} ${active ? "text-accent" : "text-muted hover:text-text"}`}
                >
                  {inner}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Próximamente"
                  className={`${base} cursor-not-allowed text-muted/45`}
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
