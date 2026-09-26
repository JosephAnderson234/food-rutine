"use client";

import { getDB } from "@app/data/db";
import { getSession } from "@app/data/session";
import { finishWelcome, wasWelcomed } from "@app/lib/onboarding";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** La primera vez en este dispositivo manda a la bienvenida (salvo que ya haya sesión). */
export function FirstRunGate() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/bienvenida" || wasWelcomed()) return;
    let cancelled = false;
    void getSession(getDB()).then((session) => {
      if (cancelled) return;
      if (session) finishWelcome();
      else router.replace("/bienvenida");
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);
  return null;
}
