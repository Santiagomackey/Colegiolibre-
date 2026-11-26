const CACHE_VERSION = "colegiolibre-pwa-v102";
const APP_SHELL = [
  "/",
  "/404.html",
  "/styles.css",
  "/marketplace-layout.css",
  "/home-experience.css",
  "/mobile.css",
  "/chrome-theme.css",
  "/home-header.css",
  "/pwa.css",
  "/preferences.css",
  "/polish.css",
  "/script.js",
  "/mobile-ui.js",
  "/native-bridge.js",
  "/pwa.js",
  "/preferences.js",
  "/social-auth.js",
  "/auth-routing.js",
  "/site-header.js",
  "/site-header.css",
  "/alerts-enhancements.js",
  "/telemetry.js",
  "/products.js",
  "/vendor/supabase.js",
  "/images/colego-logo.svg",
  "/images/materiales.webp",
  "/images/icon-192.png",
  "/images/icon-512.png",
  "/images/icon-maskable-512.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("colegiolibre-pwa-") && key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", event => {
  const notice = event.data?.json() || {};
  const destination = new URL(notice.url || "/", self.location.origin);
  event.waitUntil(self.registration.showNotification(notice.title || "ColeGo", {
    body: notice.body || "",
    icon: "/images/colego-cart-192.png",
    tag: notice.id,
    data: {url: destination.origin === self.location.origin ? destination.href : "/"}
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(destination);
        return existing.focus();
      }
      return self.clients.openWindow(destination);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, {cache: "no-cache"})
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          return cachedPage || caches.match("/");
        })
    );
    return;
  }

  if (["style", "script"].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const response = await fetch(request, {cache: "no-cache"});
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (["image", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);

        return cached || network;
      })
    );
  }
});
