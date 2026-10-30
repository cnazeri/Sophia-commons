var CACHE_NAME = 'sophia-commons-v1.103.0';
var STATIC_ASSETS = [
  '/',
  '/sophia_commons_v9.css',
  '/sophia_commons_v9.js',
  '/blog.js',
  '/claims.js',
  '/i18n.js',
  '/lang/en.json',
  '/manifest.json',
  '/offline.html',
  '/img/logo-mark-112.webp'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle same-origin GETs; let the browser deal with APIs, fonts, analytics and CDNs.
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Versioned JS/CSS (?v=...) never change: serve from cache first, fetch once otherwise
  if (/\.(css|js)$/.test(url.pathname) && /[?&]v=/.test(url.search)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(hit) {
          return hit || fetch(event.request).then(function(response) {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(function(response) {
      // Cache successful responses for static assets
      if (response.ok && (/\.(css|js)$/.test(url.pathname) || /^\/lang\/[a-z]{2}\.json$/.test(url.pathname) || url.pathname === '/')) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Serve from cache when offline
      return caches.match(event.request, { ignoreSearch: true }).then(function(cached) {
        if (cached) return cached;
        // Navigations: the home page works from cache; any other page gets a clear offline page
        // (the app shell alone would sit on "Loading..." without the database)
        if (event.request.mode === 'navigate') {
          return url.pathname === '/' ? caches.match('/') : caches.match('/offline.html');
        }
      });
    })
  );
});
