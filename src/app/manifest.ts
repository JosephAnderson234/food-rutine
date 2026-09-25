import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Meal Prep",
    short_name: "Meal Prep",
    description:
      "Tu semana de comida: horario, meal prep, compras, táperes, mochila y gym.",
    lang: "es-PE",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3ee",
    theme_color: "#c2410c",
    categories: ["food", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Hoy", url: "/hoy" },
      { name: "Semana", url: "/semana" },
      { name: "Compras", url: "/compras" },
      { name: "Cocina", url: "/cocina" },
    ],
  };
}
