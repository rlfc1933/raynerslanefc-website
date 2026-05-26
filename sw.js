// Rayners Lane FC Service Worker
var CACHE = 'rlfc-v1';
var ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/components.js',
  '/js/main.js',
  '/img/badge.png',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).catch(function() {
        return caches.match('/index.html');
      });
    })
  );
});
