// Offline support: app shell cached, network-first so updates arrive quickly
const CACHE = 'kharcha-v2';
const SHELL = ['./', './index.html', './css/styles.css', './js/app.js', './js/store.js', './js/ui.js', './js/shared.js', './js/views.js', './js/sheets.js', './js/voice.js', './js/sync.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || /supabase\.(co|in)/.test(e.request.url)) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes('fonts.g'))) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html'))));
});
