/**
 * LocalShop Service Worker
 * - Caches app shell for offline use
 * - Network-first for Firebase/API calls (always fresh data)
 * - Cache-first for static assets (CSS, JS, images)
 *
 * Update CACHE_VERSION when you deploy big changes to force cache refresh.
 */

const CACHE_VERSION = "localshop-v1.0.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

/* Files to cache immediately on install (the "app shell") */
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/customer/cart.html",
  "/customer/checkout.html",
  "/customer/order-history.html",
  "/customer/Nearby-Shops.html",
  "/js/firebase.js",
  "/js/weight-utils.js",
  "/js/pricing-config.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/offline.html"
];

/* === INSTALL: Cache the app shell === */
self.addEventListener("install", (event) => {
  console.log("[SW] Installing version:", CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching app shell");
        // Use addAll but don't fail if one file is missing
        return Promise.allSettled(
          STATIC_ASSETS.map((url) => cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to cache ${url}:`, err);
          }))
        );
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

/* === ACTIVATE: Clean up old caches === */
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating version:", CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/* === FETCH: Smart caching strategy === */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Skip non-GET requests (POST, PUT, etc.) */
  if (request.method !== "GET") return;

  /* Skip Chrome extensions */
  if (url.protocol === "chrome-extension:") return;

  /* Strategy 1: Firebase / API calls — Network first (always fresh) */
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebase") ||
    url.pathname.includes("/api/")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* Strategy 2: Images — Cache first, network fallback */
  if (
    request.destination === "image" ||
    url.hostname.includes("cloudinary") ||
    url.hostname.includes("placeholder")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* Strategy 3: HTML pages — Network first (fresh content), cache fallback */
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  /* Strategy 4: Everything else (CSS, JS, fonts) — Stale while revalidate */
  event.respondWith(staleWhileRevalidate(request));
});

/* === CACHING STRATEGIES === */

/** Network first: try network, fall back to cache */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

/** Network first, with offline page fallback for navigation */
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    /* Last resort: offline page */
    return caches.match("/offline.html");
  }
}

/** Cache first: try cache, fall back to network */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    /* Return placeholder image if image fails */
    if (request.destination === "image") {
      return caches.match("/icons/icon-192.png");
    }
    throw error;
  }
}

/** Stale while revalidate: return cache immediately, update in background */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse && networkResponse.ok) {
      caches.open(DYNAMIC_CACHE).then((cache) => {
        cache.put(request, networkResponse.clone());
      });
    }
    return networkResponse;
  }).catch(() => cached);

  return cached || fetchPromise;
}

/* === HANDLE PUSH NOTIFICATIONS (for future use) === */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "LocalShop", body: event.data.text() };
  }

  const options = {
    body: data.body || "You have a new notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-72.png",
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "LocalShop", options)
  );
});

/** Click on notification → open the app */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

console.log("[SW] LocalShop Service Worker loaded:", CACHE_VERSION);
