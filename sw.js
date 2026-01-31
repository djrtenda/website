// Nama cache unik - Selalu ubah versi (misal v100 ke v101) jika Anda update kode JS/HTML
const CACHE_NAME = 'djrtenda-v101-final-fix';

// Daftar file lokal yang akan disimpan untuk akses offline
const urlsToCache = [
  '/website/',
  '/website/index.html',
  '/website/admin.html',
  '/website/rekap.html',
  '/website/firebase-config.js',
  '/website/js/app.js',
  '/website/js/admin.js',
  '/website/js/rekap.js',
  '/website/js/security.js',
  '/website/assets/img/djrtenda.png',
  '/website/assets/img/icon-192x192.png',
  '/website/assets/img/icon-512x512.png',
  '/website/manifest.json'
];

// Tahap Instalasi: Menyimpan file ke dalam Cache Storage
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Membuka Cache dan menyimpan file lokal');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Memaksa SW baru segera aktif
  );
});

// Tahap Aktivasi: Membersihkan cache lama agar tidak memenuhi memori
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Mengambil kendali atas semua tab terbuka segera
  );
});

// Tahap Pengambilan (Fetch): Melayani file dari cache jika ada, jika tidak ambil dari internet
self.addEventListener('fetch', event => {
  // Lewati permintaan untuk link eksternal seperti Tailwind CDN agar tidak terkena error CORS di console
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Jika file ditemukan di cache, kembalikan file tersebut
        if (response) {
          return response;
        }
        // Jika tidak, ambil dari jaringan secara normal
        return fetch(event.request);
      })
  );
});