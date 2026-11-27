const CACHE_NAME = 'brickbase-standalone-v11-mwyvwv0b';
const CDN_IMAGE_CACHE = 'brickbase-cdn-images-v1';
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./app.css",
  "./manifest.json",
  "./pwa-192x192.png",
  "./pwa-512x512.png",
  "./pwa-maskable-512x512.png",
  "./apple-touch-icon.png",
  "./favicon-32x32.png",
  "./brickbase-logo-embed.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== CDN_IMAGE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Cache-first for Rebrickable CDN set & part thumbnails so photos load instantaneously on revisit
  if (url.hostname === 'cdn.rebrickable.com' && url.pathname.startsWith('/media/')) {
    event.respondWith(
      caches.open(CDN_IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Never intercept Google Apps Script or other third-party API calls
  const isGoogleFonts =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isGoogleFonts) {
    return;
  }

  // Always fetch live API requests over the network
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for HTML navigation and versioned app bundle so updates always appear immediately
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/app.css')
  ) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('./index.html')) || (await caches.match('./')))
    );
    return;
  }

  // Stale-while-revalidate for same-origin icons/manifest and Google Fonts
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkPromise = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(request, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkPromise;
    })
  );
});
