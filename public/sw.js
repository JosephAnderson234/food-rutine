/* Service worker de Meal Prep: app usable sin conexión.
 * - Páginas y datos RSC: red primero, caché si no hay conexión.
 * - /_next/static, íconos y fuentes: caché primero (llevan hash, no cambian).
 * - /api/*: siempre red (la IA necesita internet).
 * Subir VERSION invalida las cachés anteriores.
 */
const VERSION = "v2";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const PAGES = ["/hoy", "/semana", "/compras", "/cocina", "/ajustes"];
const FALLBACK = "/hoy";

/** Precarga cada pantalla y los scripts/estilos que referencia, para abrirla offline. */
async function precache() {
  const pages = await caches.open(PAGES_CACHE);
  const assets = await caches.open(STATIC_CACHE);
  const found = new Set();
  await Promise.all(
    PAGES.map(async (path) => {
      try {
        const res = await fetch(path, { cache: "no-store" });
        if (!res.ok) return;
        const html = await res.clone().text();
        await pages.put(path, res);
        for (const m of html.matchAll(/\/_next\/static\/[^"'\s)]+/g))
          found.add(m[0]);
      } catch {
        // sin red durante la instalación: se llenará al navegar
      }
    }),
  );
  await Promise.all(
    [...found, "/icons/icon-192.png", "/icons/icon-512.png"].map((url) =>
      assets.add(url).catch(() => undefined),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// La app pide activar la versión nueva cuando el usuario acepta.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC_CACHE)).put(request, res.clone());
  return res;
}

async function networkFirst(request, { navigate }) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: !navigate });
    if (cached) return cached;
    if (navigate) {
      const fallback = await cache.match(FALLBACK);
      if (fallback) return fallback;
    }
    return new Response("Sin conexión", { status: 503, statusText: "offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(
    networkFirst(request, { navigate: request.mode === "navigate" }),
  );
});

// Avisos push del backend (llegan aunque la app esté cerrada).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Meal Prep";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: title,
      data: { url: data.url || "/hoy" },
    }),
  );
});

// Tocar un aviso abre (o enfoca) la app en la pantalla indicada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? FALLBACK;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open =
        all.find((c) => new URL(c.url).pathname === target) ?? all[0];
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(target);
      } else {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
