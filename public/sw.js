const CACHE_VERSION = "solaris-app-v16";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/icon-192.png?v=img2340-20260929",
  "/icon-512.png?v=img2340-20260929",
  "/icon-maskable.svg?v=maskable-20260930",
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

function pushBaseOrigin() {
  try {
    if (typeof self.location?.origin === "string" && self.location.origin) {
      return self.location.origin;
    }
    if (
      typeof URL === "function" &&
      typeof self.location?.href === "string" &&
      self.location.href
    ) {
      return new URL(self.location.href).origin;
    }
  } catch {
    // The real ServiceWorkerGlobalScope always has location. The inert fallback
    // keeps pure/unit evaluation deterministic without weakening the lexical
    // external-route rejection below.
  }
  return "https://solaris.invalid";
}

function normalizePushRoute(candidate) {
  // Push destinations are internal deep links. A leading slash alone is not a
  // sufficient origin boundary because protocol-relative URLs (`//host/path`)
  // also begin with `/`, and backslashes can be normalized as URL separators by
  // browsers. Fail closed unless the candidate is unambiguously root-relative.
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return "/";
  }

  // Root-relative + non-protocol-relative + no backslash is already sufficient
  // to prevent cross-origin navigation. Strip payload-owned fragments before
  // persisting the notification. This lexical path also keeps the service-worker
  // contract testable in deliberately tiny VM harnesses that omit the URL global.
  const hashIndex = candidate.indexOf("#");
  const withoutHash = hashIndex >= 0 ? candidate.slice(0, hashIndex) : candidate;
  const safeCandidate = withoutHash || "/";

  if (typeof URL !== "function") return safeCandidate;

  try {
    const origin = pushBaseOrigin();
    const target = new URL(safeCandidate, origin);
    if (target.origin !== origin) return "/";
    return `${target.pathname}${target.search}`;
  } catch {
    return "/";
  }
}

async function reportPushReceipt(data, stage) {
  const deliveryId =
    typeof data?.deliveryId === "string" ? data.deliveryId : null;
  const receiptToken =
    typeof data?.receiptToken === "string" ? data.receiptToken : null;
  const receiptUrl =
    typeof data?.receiptUrl === "string" && data.receiptUrl.startsWith("https://")
      ? data.receiptUrl
      : null;

  if (!deliveryId || !receiptToken || !receiptUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(receiptUrl, {
      signal: controller.signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deliveryId,
        token: receiptToken,
        stage,
      }),
    });
  } catch {
    // Delivery receipts are diagnostics. A telemetry outage must never stop the
    // notification itself from being shown or opened.
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text?.() ?? "" };
  }

  const title = typeof payload.title === "string" ? payload.title : "Solaris Studio";
  const route = normalizePushRoute(payload.route);
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/icon-192.png?v=img2340-20260929",
    badge: "/icon-192.png?v=img2340-20260929",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    renotify: false,
    data: {
      route,
      deliveryId:
        typeof payload.deliveryId === "string" ? payload.deliveryId : null,
      receiptToken:
        typeof payload.receiptToken === "string" ? payload.receiptToken : null,
      receiptUrl:
        typeof payload.receiptUrl === "string" ? payload.receiptUrl : null,
    },
  };

  // Display is the critical path; receipt networking cannot delay it.
  const display = self.registration.showNotification(title, options);
  event.waitUntil(Promise.all([
    display.then(() => reportPushReceipt(options.data, "displayed")),
    reportPushReceipt(options.data, "received"),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Revalidate persisted notification data at click time as well. A notification
  // may outlive the worker instance that originally displayed it.
  const route = normalizePushRoute(event.notification.data?.route);
  const targetUrl = new URL(route, pushBaseOrigin());
  targetUrl.hash = "solaris-push-open";
  const target = targetUrl.href;

  event.waitUntil(
    Promise.all([
      reportPushReceipt(event.notification.data, "opened"),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            if ("focus" in client) {
              client.navigate?.(target);
              return client.focus();
            }
          }
          return self.clients.openWindow
            ? self.clients.openWindow(target)
            : undefined;
        }),
    ]),
  );
});
