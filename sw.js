const CACHE_NAME = 'ari-shuffler-v1';

// Wakes up the service worker
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Intercepts fetch requests so Chrome recognizes it as a true app background process
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
