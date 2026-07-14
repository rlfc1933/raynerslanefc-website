// Rayners Lane FC Service Worker — NETWORK-FIRST.
// Always tries the live network so updates show immediately; the cache is only
// an offline fallback. (The old cache-first version froze the site on returning
// visitors and made deploys look like they hadn't happened.)
var CACHE = 'rlfc-v8'; // bump on deploy → old caches purged, new assets picked up cleanly
var CORE = ['/', '/index.html', '/css/style.css', '/css/icons.css', '/js/components.js', '/js/main.js', '/img/badge.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE).catch(function(){}); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// ── Web Push: match alerts ──
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Rayners Lane FC', body: (e.data && e.data.text()) || '' }; }
  var opts = {
    body: d.body || '',
    icon: '/img/badge.png',
    badge: '/img/badge.png',
    data: { url: d.url || '/' },
    tag: d.tag || 'rlfc',
    renotify: true,
  };
  e.waitUntil(self.registration.showNotification(d.title || 'Rayners Lane FC', opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) { if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  // Never cache data files or serverless functions — always live.
  if (req.url.indexOf('/data/') !== -1 || req.url.indexOf('/.netlify/') !== -1) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('/index.html'); });
    })
  );
});
