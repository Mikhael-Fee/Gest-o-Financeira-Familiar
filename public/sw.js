/* Cache only the unauthenticated shell. No financial responses or tokens. */
const CACHE = "entre-nos-shell-v1";
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/", "/icon-192.png", "/icon-512.png"])),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    event.request.headers.has("authorization")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icon-"))
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const saved = await cache.match(event.request, { ignoreVary: true });
        if (saved) return saved;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
});
