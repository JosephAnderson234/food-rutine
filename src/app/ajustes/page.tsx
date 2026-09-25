import { SettingsView } from "@app/components/settings/SettingsView";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ajustes" };

export default function AjustesPage() {
  return <SettingsView />;
}
