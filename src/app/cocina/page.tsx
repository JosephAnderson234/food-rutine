import { CookView } from "@app/components/cook/CookView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cocina" };

export default function CocinaPage() {
  return <CookView />;
}
