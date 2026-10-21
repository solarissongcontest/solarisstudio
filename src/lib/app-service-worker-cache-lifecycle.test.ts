import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

const swSource = () => readFileSync("public/sw.js", "utf8");

type CacheRequest = { url: string };
type RuntimeCache = {
  keys: () => Promise<CacheRequest[]>;
  delete: (request: CacheRequest) => Promise<boolean>;
};
type CacheResponse = {
  ok: boolean;
  type: string;
  clone: () => CacheResponse;
};
type AssetCache = RuntimeCache & {
  match: (request: CacheRequest) => Promise<CacheResponse | null>;
  put: (request: CacheRequest, response: CacheResponse) => Promise<void>;
};
type CacheStorageLike = {
  open: (name: string) => Promise<AssetCache>;
};
type StaleWhileRevalidate = (request: CacheRequest) => {
  response: Promise<CacheResponse>;
  revalidation: Promise<void>;
};
type TrimRuntimeCache = (cache: RuntimeCache) => Promise<void>;

function loadTrimRuntimeCache(): TrimRuntimeCache {
  const source = swSource();
  const start = source.indexOf("async function trimRuntimeCache");
  const end = source.indexOf("\n\nfunction firstUsableValue", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const functionSource = source.slice(start, end);
  const factory = new Function(
    `const MAX_RUNTIME_CACHE_ENTRIES = 96; ${functionSource}; return trimRuntimeCache;`,
  ) as () => TrimRuntimeCache;

  return factory();
}

function loadStaleWhileRevalidate({
  cacheStorage,
  fetchImpl,
  responseError,
}: {
  cacheStorage: CacheStorageLike;
  fetchImpl: (request: CacheRequest) => Promise<CacheResponse>;
  responseError: () => CacheResponse;
}): StaleWhileRevalidate {
  const source = swSource();
  const start = source.indexOf("async function trimRuntimeCache");
  const end = source.indexOf('\n\nself.addEventListener("fetch"', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  // Keep this VM harness tied to the real production helpers without executing
  // unrelated service-worker top-level setup (PRECACHE/install/activate).
  const functionSource = source.slice(start, end);
  const factory = new Function(
    "caches",
    "fetch",
    "Response",
    `const STATIC_CACHE = "static"; const RUNTIME_CACHE = "runtime"; const MAX_RUNTIME_CACHE_ENTRIES = 96; ${functionSource}; return staleWhileRevalidate;`,
  ) as (
    caches: CacheStorageLike,
    fetch: (request: CacheRequest) => Promise<CacheResponse>,
    response: { error: () => CacheResponse },
  ) => StaleWhileRevalidate;

  return factory(cacheStorage, fetchImpl, { error: responseError });
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
    expect(source).toContain(
      "const runtimeCachePromise = caches.open(RUNTIME_CACHE)",
    );
    expect(source).toMatch(/caches\s*\.open\(STATIC_CACHE\)/);
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
    expect(source).toContain(
      "return (await caches.match(OFFLINE_URL)) || Response.error()",
    );
  });

  it("keeps a successful network asset when runtime cache writes fail", async () => {
    const request = { url: "/assets/current.js" };
    const networkResponse: CacheResponse = {
      ok: true,
      type: "basic",
      clone: () => networkResponse,
    };
    const runtimeCache: AssetCache = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => {
        throw new Error("quota exceeded");
      }),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const staticCache: AssetCache = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const cacheStorage: CacheStorageLike = {
      open: vi.fn(async (name) =>
        name === "runtime" ? runtimeCache : staticCache,
      ),
    };
    const responseError = vi.fn(() => ({
      ok: false,
      type: "error",
      clone: () => networkResponse,
    }));
    const staleWhileRevalidate = loadStaleWhileRevalidate({
      cacheStorage,
      fetchImpl: vi.fn(async () => networkResponse),
      responseError,
    });

    const result = staleWhileRevalidate(request);

    await expect(result.response).resolves.toBe(networkResponse);
    await expect(result.revalidation).resolves.toBeUndefined();
    expect(runtimeCache.put).toHaveBeenCalledTimes(1);
    expect(responseError).not.toHaveBeenCalled();
  });

  it("does not delay a successful network asset behind pending cache maintenance", async () => {
    const request = { url: "/assets/current.js" };
    const networkResponse: CacheResponse = {
      ok: true,
      type: "basic",
      clone: () => networkResponse,
    };
    let putStarted = false;
    const neverFinishes = new Promise<void>(() => undefined);
    const runtimeCache: AssetCache = {
      match: vi.fn(async () => null),
      put: vi.fn(() => {
        putStarted = true;
        return neverFinishes;
      }),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const staticCache: AssetCache = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const cacheStorage: CacheStorageLike = {
      open: vi.fn(async (name) =>
        name === "runtime" ? runtimeCache : staticCache,
      ),
    };
    const staleWhileRevalidate = loadStaleWhileRevalidate({
      cacheStorage,
      fetchImpl: vi.fn(async () => networkResponse),
      responseError: vi.fn(() => ({
        ok: false,
        type: "error",
        clone: () => networkResponse,
      })),
    });

    const result = staleWhileRevalidate(request);

    await expect(result.response).resolves.toBe(networkResponse);
    expect(putStarted).toBe(true);
    // Deliberately do not await revalidation: the unresolved write models slow
    // storage, while the response must already have reached the page.
  });

  it("keeps a successful network asset when Cache Storage cannot open", async () => {
    const request = { url: "/assets/current.js" };
    const networkResponse: CacheResponse = {
      ok: true,
      type: "basic",
      clone: () => networkResponse,
    };
    const cacheStorage: CacheStorageLike = {
      open: vi.fn(async () => {
        throw new Error("cache storage unavailable");
      }),
    };
    const responseError = vi.fn(() => ({
      ok: false,
      type: "error",
      clone: () => networkResponse,
    }));
    const staleWhileRevalidate = loadStaleWhileRevalidate({
      cacheStorage,
      fetchImpl: vi.fn(async () => networkResponse),
      responseError,
    });

    const result = staleWhileRevalidate(request);

    await expect(result.response).resolves.toBe(networkResponse);
    await expect(result.revalidation).resolves.toBeUndefined();
    expect(responseError).not.toHaveBeenCalled();
  });

  it("evicts only the oldest overflow runtime entries", async () => {
    const trimRuntimeCache = loadTrimRuntimeCache();
    const requests = Array.from({ length: 100 }, (_, index) => ({
      url: `/assets/chunk-${index}.js`,
    }));
    const deleteEntry = vi.fn(async (_request: CacheRequest) => true);

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
    const deleteEntry = vi.fn(async (_request: CacheRequest) => true);

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
