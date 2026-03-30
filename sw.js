var CACHE_NAME = 'sophia-commons-v1.4.0';
var STATIC_ASSETS = [
  '/',
  '/sophia_commons_v9.css',
  '/sophia_commons_v9.js',
  '/manifest.json'
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

  // Skip non-GET and external API calls
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('google-analytics.com')) return;

  event.respondWith(
    fetch(event.request).then(function(response) {
      // Cache successful responses for static assets
      if (response.ok && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname === '/')) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Serve from cache when offline
      return caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        // For navigation requests, serve the cached index
        if (event.request.mode === 'navigate') {
          return caches.match('/');
        }
      });
    })
  );
});
