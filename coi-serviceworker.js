/*! coi-serviceworker v0.1.7 - MIT License - Guido Zuidhof */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", event => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.status === 0) {
                        return response;
                    }
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                })
                .catch(e => console.error(e))
        );
    });
} else {
    (async function () {
        if (window.crossOriginIsolated) return;

        const registration = await navigator.serviceWorker.register(window.document.currentScript.src).catch((e) => {
            console.error("COOP/COEP Service Worker failed to register:", e);
        });

        if (registration) {
            console.log("COOP/COEP Service Worker registered", registration.scope);

            registration.addEventListener("updatefound", () => {
                window.location.reload();
            });

            if (registration.active && !navigator.serviceWorker.controller) {
                window.location.reload();
            }
        }
    })();
}
