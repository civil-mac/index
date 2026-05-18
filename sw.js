const CACHE_NAME = 'ari-shuffler-v1';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

// Intercepts network calls to force Chrome to recognize this as a valid app background process
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
