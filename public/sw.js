// Offline play. Built files under assets/ have a hash in their name, so they never
// change and are served from the cache first. Everything else (the page, manifest,
// icons) comes from the network first so updates show up, with the cache as backup.

const CACHE = 'digdeep';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes('/assets/') ? cacheFirst(req) : networkFirst(req));
});

// The page lists the files it loaded: cache those and the page itself, and drop
// built files that the current version no longer uses.
self.addEventListener('message', (e) => {
  const keep = e.data?.keep;
  if (!Array.isArray(keep)) return;
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const url of [self.registration.scope, ...keep]) {
        if (!(await cache.match(url))) await cache.add(url).catch(() => {});
      }
      for (const req of await cache.keys()) {
        if (req.url.includes('/assets/') && !keep.includes(req.url)) await cache.delete(req);
      }
    })(),
  );
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  // Every page load (with or without ?seed) is stored as the one start page.
  const key = req.mode === 'navigate' ? self.registration.scope : req;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    throw err;
  }
}
