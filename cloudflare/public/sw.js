// Cache name: update this string on each deploy to bust old caches.
// Using a build-time timestamp avoids manual version bumps.
// Even if forgotten, Network-First strategy below ensures fresh content is served.
const CACHE_NAME = 'docsreader-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-any.png',
  '/icon-maskable.png',
];

// --- Install: cache core assets, then activate immediately ---
self.addEventListener('install', (event) => {
  // skipWaiting: new SW activates right away without waiting for old tabs to close.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// --- Activate: claim all clients and remove stale caches ---
self.addEventListener('activate', (event) => {
  // clients.claim: new SW takes control of all open tabs immediately.
  event.waitUntil(
    (async () => {
      // Delete any caches that don't match the current CACHE_NAME
      const keyList = await caches.keys();
      await Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
      await self.clients.claim();
    })()
  );
});

// --- Fetch: Network-First strategy ---
// Always try the network first so users get the latest build.
// Fall back to cache only when the network is unavailable (e.g. offline).
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests (Google OAuth, Drive API, etc.)
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        // Try network first
        const networkResponse = await fetch(event.request);
        // Cache the fresh response for offline fallback
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (_err) {
        // Network failed — serve from cache (offline fallback)
        const cached = await cache.match(event.request);
        return cached ?? new Response('Offline', { status: 503 });
      }
    })()
  );
});
