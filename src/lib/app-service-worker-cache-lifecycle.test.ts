import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

const swSource = () => readFileSync("public/sw.js", "utf8");

type CacheRequest = { url: string };
type RuntimeCache = {
  keys: () => Promise<CacheRequest[]>;
  delete: (request: CacheRequest) => Promise<boolean>;
};

type TrimRuntimeCache = (cache: RuntimeCache) => Promise<void>;

function loadTrimRuntimeCache(): TrimRuntimeCache {
  const source = swSource();
  const start = source.indexOf("const MAX_RUNTIME_CACHE_ENTRIES");
  const end = source.indexOf("\n\nfunction staleWhileRevalidate", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const functionSource = source.slice(start, end);
  const factory = new Function(
    `${functionSource}; return trimRuntimeCache;`,
  ) as () => TrimRuntimeCache;

  return factory();
}

describe("PWA service-worker cache lifecycle", () => {
  it("separates durable precache content from a bounded runtime asset cache", () => {
    const source = swSource();

    expect(source).toContain('const STATIC_CACHE = `${CACHE_VERSION}:static`');
    expect(source).toContain('const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`');
    expect(source).toContain("const MAX_RUNTIME_CACHE_ENTRIES = 96");
    expect(source).toContain(
      "const currentCaches = new Set([STATIC_CACHE, RUNTIME_CACHE])",
    );
    expect(source).toContain("const runtimeCachePromise = caches.open(RUNTIME_CACHE)");
    expect(source).toContain("caches.open(STATIC_CACHE).then((cache) => cache.match(request))");
    expect(source).toContain("await trimRuntimeCache(cache)");
  });

  it("keeps stale-while-revalidate work alive after returning a cached response", () => {
    const source = swSource();

    expect(source).toContain(
      "const { response, revalidation } = staleWhileRevalidate(request)",
    );
    expect(source).toContain("event.respondWith(response)");
    expect(source).toContain("event.waitUntil(revalidation)");
  });

  it("keeps navigational HTML network-first with the dedicated offline fallback", () => {
    const source = swSource();

    expect(source).toContain('if (request.mode === "navigate")');
    expect(source).toContain("event.respondWith(networkNavigation(request))");
    expect(source).toContain("return (await caches.match(OFFLINE_URL)) || Response.error()");
    expect(source).not.toContain("cache.put(request, response.clone())\n    return response\n  } catch");
  });

  it("evicts only the oldest overflow runtime entries", async () => {
    const trimRuntimeCache = loadTrimRuntimeCache();
    const requests = Array.from({ length: 100 }, (_, index) => ({
      url: `/assets/chunk-${index}.js`,
    }));
    const deleteEntry = vi.fn(async () => true);

    await trimRuntimeCache({
      keys: async () => requests,
      delete: deleteEntry,
    });

    expect(deleteEntry).toHaveBeenCalledTimes(4);
    expect(deleteEntry.mock.calls.map(([request]) => request.url)).toEqual(
      requests.slice(0, 4).map((request) => request.url),
    );
  });

  it("does not evict anything while the runtime cache stays within budget", async () => {
    const trimRuntimeCache = loadTrimRuntimeCache();
    const deleteEntry = vi.fn(async () => true);

    await trimRuntimeCache({
      keys: async () =>
        Array.from({ length: 96 }, (_, index) => ({
          url: `/assets/chunk-${index}.js`,
        })),
      delete: deleteEntry,
    });

    expect(deleteEntry).not.toHaveBeenCalled();
  });
});
