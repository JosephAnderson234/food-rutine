import { BottomNav } from "@app/components/nav/BottomNav";
import { PwaRuntime } from "@app/components/pwa/PwaRuntime";
import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Sans,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
});

const sans = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
});

const mono = JetBrains_Mono({
  variable: "--font-numbers",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Meal Prep", template: "%s · Meal Prep" },
  applicationName: "Meal Prep",
  appleWebApp: { capable: true, title: "Meal Prep", statusBarStyle: "default" },
  description:
    "Horario → comidas → compras → preparación → almacenamiento → mochila → gym.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-32">
          {children}
        </main>
        <BottomNav />
        <PwaRuntime />
      </body>
    </html>
  );
}
