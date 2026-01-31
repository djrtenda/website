const CACHE_NAME = 'djrtenda-v2-private';
const urlsToCache = [
  '/web/',
  '/web/index.html',
  '/web/admin.html',
  '/web/firebase-config.js',
  '/web/js/app.js',
  '/web/js/admin.js',
  '/web/js/security.js',
  '/web/assets/img/djrtenda.png',
  '/web/assets/img/icon-192x192.png',
  '/web/assets/img/icon-512x512.png',
  // Resource Eksternal (CDN)
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://unpkg.com/jspdf-autotable@3.5.23/dist/jspdf.plugin.autotable.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Hapus cache lama saat ada update baru
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});