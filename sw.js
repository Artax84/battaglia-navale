// Battaglia Navale — Service Worker
// Strategy:
//   - precache the app shell so single-player works offline
//   - network-first for HTML navigations (so updates land quickly when online)
//   - cache-first for static assets and Google Fonts
//   - never cache /socket.io/* (live multiplayer; offline = single only)
const VERSION = 'bn-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    try { await cache.addAll(CORE); } catch (e) { /* best-effort */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept socket.io traffic
  if (url.pathname.startsWith('/socket.io/')) return;

  // Navigation requests: network-first, fallback to cache (offline shell)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        return cached || new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  // Same-origin static assets and Google Fonts: cache-first
  const isFonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isSameOrigin = url.origin === self.location.origin;
  if (isSameOrigin || isFonts) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const cache = await caches.open(VERSION);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
  }
});
