const CACHE_VERSION = "solaris-app-v1";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png?v=img2340-20260929",
  "/icon-512.png?v=img2340-20260929",
  "/solaris-background.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("solaris-app-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/sw.js") return false;

  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/_build/") ||
    /\.(?:css|js|mjs|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)
  );
}

async function networkNavigation(request) {
  try {
    // Never cache navigational HTML. In particular a deliberate 503 maintenance
    // response must pass through unchanged instead of being replaced by an old
    // app shell.
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkNavigation(request));
    return;
  }

  if (isCacheableStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
