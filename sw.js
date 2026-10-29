/* TimothyOS service worker: keeps the app shell available offline.
   Bump VERSION on every release so the iPad picks up new files. */
var VERSION = "2.51.4";
var SHELL = "tos-shell-" + VERSION;
var SHELL_FILES = [
  "./",
  "index.html",
  "css/app.css?v=2.51.4",
  "js/app.js?v=2.51.4",
  "manifest.webmanifest",
  "js/vendor/satellite.min.js",
  "js/vendor/astronomy.min.js",
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

/* A new version installs, then waits (2.43.2). It used to take over at once (skipWaiting on install), which could
   happen while the page was reloading on UPDATE READY: the old worker was retired with the page's script and style
   requests still in its hands, and the app came up as a header over a black screen, or as unstyled HTML. Now the
   app asks the waiting version to take over and reloads only once it has (or the app is closed and reopened).
   Files are fetched past the browser's HTTP cache so a new version never stores an old copy. */
self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES.map(function (u) { return new Request(u, { cache: "reload" }); })); }));
});

self.addEventListener("message", function (event) {
  if (event.data === "skipWaiting") self.skipWaiting();
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
    /* Only the app itself is saved as the offline page; any other page on the site passes straight through. */
    var shell = new URL("./", self.registration.scope).pathname, isApp = url.pathname === shell || url.pathname === shell + "index.html";
    if (!isApp) return;
    event.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
      /* 2.50: only a good answer replaces the saved copy; an error page (a hosting hiccup) falls back to it instead */
      if (!res.ok) return caches.match("./").then(function (hit) { return hit || res; });
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put("./", copy); });
      return res;
    }).catch(function () { return caches.match("./"); }));
    return;
  }

  /* Versioned static files: cache first. */
  event.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});
