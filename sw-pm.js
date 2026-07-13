// The Lane App service worker — separate scope from the public site's sw.js.
// Caches the app shell so it opens offline; never caches the function calls
// (writes queue in the app; reads are cached in localStorage by the app).
var CACHE = 'lane-pm-v1';
var SHELL = ['/playermanager1933.html', '/img/badge.png', '/img/icon-pm-192.png', '/img/icon-pm-512.png', '/player-manifest.json'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // writes never cached
  if (req.url.indexOf('/.netlify/functions/') !== -1) return; // live only
  // App shell / navigation: network-first, fall back to the cached app so it
  // opens with no signal (a player at an away ground still sees the details).
  if (req.mode === 'navigate' || req.url.indexOf('playermanager1933.html') !== -1) {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('/playermanager1933.html', copy); });
      return res;
    }).catch(function () { return caches.match('/playermanager1933.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (r) {
    return r || fetch(req).then(function (res) {
      if (res && res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return r; });
  }));
});
