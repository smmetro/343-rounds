// Rounds offline helper.
// NETWORK FIRST: with signal you always get the newest published app.
// Only when there is no signal (basement) does it fall back to the last copy it saw.
// This avoids the old problem where a cache-first worker kept serving stale versions.
const CACHE = 'rounds-shell-v2';
const TIMEOUT_MS = 4000;

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Only the app's own pages and files; API calls, Google sign-in etc. pass straight through
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.searchParams.has('check')) return; // update checks must always hit the network
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const u = new URL(req.url);
  const key = new Request(u.origin + u.pathname); // ignore ?v= cache-busters; each page keeps its own copy
  try {
    const res = await Promise.race([
      fetch(req, {cache: 'no-store'}),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS))
    ]);
    if (res && res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, {ignoreSearch: true});
    if (hit) return hit;
    throw err;
  }
}
