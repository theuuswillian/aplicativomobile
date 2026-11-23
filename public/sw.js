const CACHE_NAME = "granaviva-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("granaviva-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(auth|rest|storage|functions|realtime)(\/|$)/.test(url.pathname)) return;

  if (request.mode === "navigate") {
    const network = fetch(request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE_NAME).then((cache) => cache.put("/", response.clone())).then(() => response);
    });
    event.respondWith(network.catch(() => caches.match("/")));
    return;
  }

  if (/^\/assets\//.test(url.pathname) || /\.(?:svg|woff2|css|js)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response.ok) return response;
          return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())).then(() => response);
        });
      })
    );
  }
});
