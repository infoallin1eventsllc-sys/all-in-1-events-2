/*
 * Offline resilience for field operations.
 *
 * An operator at a venue is often on a phone hotspot or a site Wi-Fi that drops.
 * Without this, one reload with no signal leaves them staring at a browser error
 * while aircraft are in the air. With it, the console loads from cache.
 *
 * Strategy:
 *   install     precache the shell (index.html at the scope URL) and the hashed
 *               files it loads, so the very first offline reload works.
 *   navigation  network first, falling back to the cached shell — so a reload
 *               with signal always gets the newest deploy, and a reload without
 *               signal still opens, at any URL in scope (?view=… shortcuts too).
 *   hashed asset  cache first — the filename contains a content hash, so a hit is
 *               by definition the right bytes and never goes stale. Kept per
 *               deploy (cache named after the entry script's hash): when a new
 *               shell arrives, deploys older than the previous one are deleted,
 *               so old chunks don't pile up forever.
 *   everything else  network, cached opportunistically.
 *
 * Nothing the aircraft depends on lives here: flight commands go over Bluetooth
 * or the radio, not over HTTP.
 */

const SHELL = 'a1-shell';          // index.html (under the scope URL), manifest, icons
const RUNTIME = 'a1-runtime';      // other same-origin GETs, cached as they pass
const ASSETS = 'a1-assets-';       // + deploy id: that deploy's hashed js/css/fonts
const KEEP_DEPLOYS = 2;            // this one and the one before (tabs still open on it lazy-load its chunks)

const scopeUrl = () => self.registration.scope;   // ends with '/', e.g. https://…/drone/
const isHashedAsset = url => /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(url.pathname);
/** The deploy a shell belongs to: its entry script's hashed name. */
const deployOf = html => (html.match(/<script[^>]+src="[^"]*assets\/([\w.-]+-[A-Za-z0-9_-]{8,})\.js"/) || [])[1] || null;
const assetsIn = html => [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?))"/g)].map(m => new URL(m[1], scopeUrl()).href);

let currentAssets = null;          // cache name for the deploy the newest shell belongs to
async function assetCache() {
  if (!currentAssets) {
    const shell = await (await caches.open(SHELL)).match(scopeUrl());
    currentAssets = ASSETS + ((shell && deployOf(await shell.text())) || 'unknown');
  }
  return caches.open(currentAssets);
}

/** A fresh index.html from the network: store it as the shell, fetch what it loads, drop old deploys. */
async function adoptShell(res) {
  const html = await res.clone().text();
  const deploy = deployOf(html);
  if (!deploy) return;                                   // not the app's shell (an error page, say)
  await (await caches.open(SHELL)).put(scopeUrl(), res);
  currentAssets = ASSETS + deploy;
  const cache = await caches.open(currentAssets);
  await Promise.all(assetsIn(html).map(async u => {
    if (await caches.match(u)) return;
    try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch { /* next time */ }
  }));
  // caches.keys() lists caches in creation order: keep the newest older deploy, delete the rest.
  const older = (await caches.keys()).filter(n => n.startsWith(ASSETS) && n !== currentAssets);
  await Promise.all(older.slice(0, Math.max(0, older.length - (KEEP_DEPLOYS - 1))).map(n => caches.delete(n)));
}

self.addEventListener('install', event => {
  // Take over as soon as possible; there is no multi-tab state to protect.
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const shell = await fetch(scopeUrl(), { cache: 'reload' });
      if (shell.ok) await adoptShell(shell);
      await (await caches.open(SHELL)).addAll(['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon.svg'].map(p => new URL(p, scopeUrl()).href));
    } catch { /* installed anyway; the cache fills as the app is used */ }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Earlier versions kept everything in one cache that only ever grew ('a1-drone-v1').
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== SHELL && n !== RUNTIME && !n.startsWith(ASSETS)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

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
        if (fresh.ok && (fresh.headers.get('content-type') || '').includes('text/html')) event.waitUntil(adoptShell(fresh.clone()).catch(() => {}));
        return fresh;
      } catch {
        // Offline: every in-scope URL is the same single-page app, whatever its query string.
        const shell = await caches.open(SHELL);
        return (await shell.match(request, { ignoreSearch: true })) || (await shell.match(scopeUrl())) || Response.error();
      }
    })());
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const fresh = await fetch(request);
      if (fresh.ok) { const cache = await assetCache(); await cache.put(request, fresh.clone()); }
      return fresh;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      // 200 only: a 206 (video range request) can't be cached, and error pages shouldn't be.
      if (fresh.status === 200 && fresh.type === 'basic' && !request.headers.has('range')) {
        const cache = await caches.open(RUNTIME);
        cache.put(request, fresh.clone()).catch(() => { /* quota: skip */ });
      }
      return fresh;
    } catch {
      const hit = await caches.match(request);
      if (hit) return hit;
      throw new Error('offline and not cached');
    }
  })());
});
