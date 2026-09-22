/*
 * Offline resilience for field operations.
 *
 * An operator at a venue is often on a phone hotspot or a site Wi-Fi that drops.
 * Without this, one reload with no signal leaves them staring at a browser error
 * while aircraft are in the air. With it, the console loads from cache.
 *
 * Strategy:
 *   navigation  network first, falling back to the cached shell — so a reload
 *               with signal always gets the newest deploy, and a reload without
 *               signal still opens.
 *   hashed asset  cache first — the filename contains a content hash, so a hit is
 *               by definition the right bytes and never goes stale.
 *   everything else  network, cached opportunistically.
 *
 * Nothing the aircraft depends on lives here: flight commands go over Bluetooth
 * or the radio, not over HTTP.
 */

const CACHE = 'a1-drone-v1';

self.addEventListener('install', event => {
  // Take over as soon as possible; there is no multi-tab state to protect.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const isHashedAsset = url => /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only our own origin; camera streams, Remote ID sockets and font CDNs go direct.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(request)) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const fresh = await fetch(request);
      if (fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      throw new Error('offline and not cached');
    }
  })());
});
