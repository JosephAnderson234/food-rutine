import { TodayView } from "@app/components/today/TodayView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Hoy" };

export default function HoyPage() {
  return <TodayView />;
}
