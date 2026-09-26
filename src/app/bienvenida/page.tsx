import { WelcomeView } from "@app/components/onboarding/WelcomeView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bienvenida" };

export default function BienvenidaPage() {
  return <WelcomeView />;
}
