// Genera los íconos de la app (PWA, favicon, Apple) desde un solo dibujo SVG.
// Uso: node scripts/icons.mjs
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const BG = "#c2410c"; // terracota (accent del tema claro)
const FG = "#f6f3ee"; // papel

/** Bowl con vapor, dibujado en un lienzo de 512. `scale` < 1 deja zona segura (maskable). */
function art({ rounded, scale = 1 }) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${BG}"/>
  <g transform="${t}">
    <g fill="none" stroke="${FG}" stroke-width="22" stroke-linecap="round">
      <path d="M196 206c-18-22 18-40 0-62s18-40 0-58"/>
      <path d="M256 206c-18-22 18-40 0-62s18-40 0-58"/>
      <path d="M316 206c-18-22 18-40 0-62s18-40 0-58"/>
    </g>
    <path fill="${FG}" d="M104 240h304a152 152 0 0 1-304 0z"/>
    <rect x="186" y="398" width="140" height="26" rx="13" fill="${FG}"/>
  </g>
</svg>`;
}

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

const rounded = art({ rounded: true });
const square = art({ rounded: false });
const maskable = art({ rounded: false, scale: 0.78 });

await writeFile("src/app/icon.svg", rounded);
await writeFile("public/icons/icon-192.png", await png(rounded, 192));
await writeFile("public/icons/icon-512.png", await png(rounded, 512));
await writeFile("public/icons/maskable-512.png", await png(maskable, 512));
await writeFile("src/app/apple-icon.png", await png(square, 180));
console.log("íconos generados");
