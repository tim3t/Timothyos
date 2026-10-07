/* TimothyOS service worker: keeps the app shell available offline.
   Bump VERSION on every release so the iPad picks up new files. */
var VERSION = "2.3.0";
var SHELL = "tos-shell-" + VERSION;
var SHELL_FILES = [
  "./",
  "index.html",
  "css/app.css?v=2.3.0",
  "js/app.js?v=2.3.0",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "fonts/antonio-latin-400-normal.woff2",
  "fonts/antonio-latin-600-normal.woff2",
  "fonts/antonio-latin-700-normal.woff2",
  "fonts/barlow-semi-condensed-latin-400-normal.woff2",
  "fonts/barlow-semi-condensed-latin-500-normal.woff2",
  "fonts/barlow-semi-condensed-latin-600-normal.woff2"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SHELL; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  /* Calendar data (Apps Script) is never cached here; the app keeps its own copy. */
  if (url.origin !== self.location.origin) return;

  /* Pages: network first so updates arrive, cached copy when offline. */
  if (req.mode === "navigate") {
    event.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put("./", copy); });
      return res;
    }).catch(function () { return caches.match("./"); }));
    return;
  }

  /* Versioned static files: cache first. */
  event.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
