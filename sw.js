// Catch Me First — service worker (offline shell for the installed PWA).
// Strategy: network-first for our own HTML/CSS/JS (so deploys always update, and
// local dev is never stale), cache-first for the immutable CDN modules, and the
// big model assets are left network-only (too large to cache).
const CACHE = "cmf-v2";
const SHELL = ["./", "./index.html", "./styles/game.css", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // never touch the heavy model/texture assets or the local VRoid bridge
  if (url.pathname.includes("/assets/") || url.pathname.startsWith("/vroid")) return;

  // immutable CDN modules (three, three-vrm, transformers…) → cache-first
  if (/unpkg\.com|jsdelivr\.net|cdn\./.test(url.host)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(req, cl)); }
      return r;
    })));
    return;
  }

  // our own shell/code → network-first (fresh when online), cache fallback (offline)
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(req, cl)); }
      return r;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))));
  }
});
