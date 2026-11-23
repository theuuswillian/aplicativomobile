const CACHE_NAME = "granaviva-shell-v7";
const SHELL = ["/manifest.webmanifest", "/icon.svg", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const shellResponse = await fetch("/");
    if (!shellResponse.ok) throw new Error("Não foi possível armazenar o shell do GranaViva");
    await cache.put("/", shellResponse.clone());
    await cache.addAll(SHELL);

    const html = await shellResponse.text();
    const assets = new Set(
      [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]),
    );

    for (const path of [...assets]) {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Não foi possível armazenar o ativo ${path}`);
      await cache.put(path, response.clone());

      if (path.endsWith(".css")) {
        const css = await response.text();
        for (const match of css.matchAll(/url\(["']?(\/assets\/[^)"']+)["']?\)/g)) {
          assets.add(match[1]);
        }
      }
    }

    for (const path of assets) {
      if (await cache.match(path)) continue;
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Não foi possível armazenar o recurso ${path}`);
      await cache.put(path, response);
    }

    await self.skipWaiting();
  })());
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
    event.respondWith((async () => {
      try {
        // HTML sempre tenta a versão publicada mais recente; o cache é fallback offline.
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  if (/^\/assets\//.test(url.pathname) || /\.(?:svg|woff2|css|js|png)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (!response.ok) return response;
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
