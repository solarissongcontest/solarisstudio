export type SolarisStorageEstimate = {
  usage: number | null;
  quota: number | null;
};

const ESSENTIAL_STATIC_PATHS = new Set([
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-1024.png",
  "/solaris-background.webp",
]);

export async function estimateSolarisStorage(): Promise<SolarisStorageEstimate> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: null, quota: null };
  }

  const estimate = await navigator.storage.estimate();
  return {
    usage: typeof estimate.usage === "number" ? estimate.usage : null,
    quota: typeof estimate.quota === "number" ? estimate.quota : null,
  };
}

export async function clearSolarisRuntimeCaches() {
  if (typeof caches === "undefined") return 0;
  const names = await caches.keys();
  let removed = 0;

  for (const name of names) {
    if (!name.startsWith("solaris-app-")) continue;
    const cache = await caches.open(name);
    const requests = await cache.keys();

    for (const request of requests) {
      const url = new URL(request.url);
      if (ESSENTIAL_STATIC_PATHS.has(url.pathname)) continue;
      if (await cache.delete(request)) removed += 1;
    }
  }

  return removed;
}
