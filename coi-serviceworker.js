/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzuidhof/coi-serviceworker */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", (e) => {
        if (e.request.cache === "only-if-cached" && e.request.mode !== "same-origin") return;
        e.respondWith(
            fetch(e.request).then((r) => {
                if (r.status === 0) return r;
                const h = new Headers(r.headers);
                h.set("Cross-Origin-Embedder-Policy", "require-corp");
                h.set("Cross-Origin-Opener-Policy", "same-origin");
                return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
            }).catch((err) => console.error(err))
        );
    });
} else {
    (() => {
        const s = document.currentScript;
        const src = s ? s.src : document.querySelector('script[src*="coi-serviceworker"]').src;
        navigator.serviceWorker.register(src).then((r) => {
            r.addEventListener("updatefound", () => location.reload());
            if (r.active && !navigator.serviceWorker.controller) location.reload();
        });
    })();
}
