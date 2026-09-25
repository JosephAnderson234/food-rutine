import { WeekView } from "@app/components/week/WeekView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Semana" };

export default function SemanaPage() {
  return <WeekView />;
}
