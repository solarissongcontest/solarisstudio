import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

type CacheRequest = { url: string };
type CacheResponse = {
  ok: boolean;
  type: string;
  clone: () => CacheResponse;
};
type AssetCache = {
  match: (request: CacheRequest) => Promise<CacheResponse | null>;
  put: (request: CacheRequest, response: CacheResponse) => Promise<void>;
  keys: () => Promise<CacheRequest[]>;
  delete: (request: CacheRequest) => Promise<boolean>;
};
type CacheStorageLike = {
  open: (name: string) => Promise<AssetCache>;
};
type StaleWhileRevalidate = (request: CacheRequest) => {
  response: Promise<CacheResponse>;
  revalidation: Promise<void>;
};

function loadStaleWhileRevalidate({
  cacheStorage,
  fetchImpl,
  responseError,
}: {
  cacheStorage: CacheStorageLike;
  fetchImpl: (request: CacheRequest) => Promise<CacheResponse>;
  responseError: () => CacheResponse;
}): StaleWhileRevalidate {
  const source = readFileSync("public/sw.js", "utf8");
  const start = source.indexOf("const MAX_RUNTIME_CACHE_ENTRIES");
  const end = source.indexOf('\n\nself.addEventListener("fetch"', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const factory = new Function(
    "caches",
    "fetch",
    "Response",
    `const STATIC_CACHE = "static"; const RUNTIME_CACHE = "runtime"; ${source.slice(start, end)}; return staleWhileRevalidate;`,
  ) as (
    caches: CacheStorageLike,
    fetch: (request: CacheRequest) => Promise<CacheResponse>,
    response: { error: () => CacheResponse },
  ) => StaleWhileRevalidate;

  return factory(cacheStorage, fetchImpl, { error: responseError });
}

describe("service-worker asset response arbitration", () => {
  it("lets a successful network response bypass cache reads that never settle", async () => {
    const request = { url: "/assets/current.js" };
    const networkResponse: CacheResponse = {
      ok: true,
      type: "basic",
      clone: () => networkResponse,
    };
    const neverSettles = new Promise<CacheResponse | null>(() => undefined);
    const cache: AssetCache = {
      match: vi.fn(() => neverSettles),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const cacheStorage: CacheStorageLike = {
      open: vi.fn(async () => cache),
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

  it("lets a valid runtime cache hit bypass a stalled sibling cache and network", async () => {
    const request = { url: "/assets/cached.js" };
    const cachedResponse: CacheResponse = {
      ok: true,
      type: "basic",
      clone: () => cachedResponse,
    };
    const neverCacheSettles = new Promise<CacheResponse | null>(() => undefined);
    const neverNetworkSettles = new Promise<CacheResponse>(() => undefined);
    const runtimeCache: AssetCache = {
      match: vi.fn(async () => cachedResponse),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const staticCache: AssetCache = {
      match: vi.fn(() => neverCacheSettles),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const staleWhileRevalidate = loadStaleWhileRevalidate({
      cacheStorage: {
        open: vi.fn(async (name) =>
          name === "runtime" ? runtimeCache : staticCache,
        ),
      },
      fetchImpl: vi.fn(() => neverNetworkSettles),
      responseError: vi.fn(() => ({
        ok: false,
        type: "error",
        clone: () => cachedResponse,
      })),
    });

    const result = staleWhileRevalidate(request);

    await expect(result.response).resolves.toBe(cachedResponse);
    // Revalidation is intentionally still waiting on the network. The cache hit
    // must not inherit that latency merely because background refresh is pending.
  });

  it("returns an error only after both cache and network paths fail", async () => {
    const request = { url: "/assets/missing.js" };
    const errorResponse: CacheResponse = {
      ok: false,
      type: "error",
      clone: () => errorResponse,
    };
    const cache: AssetCache = {
      match: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
    };
    const responseError = vi.fn(() => errorResponse);
    const staleWhileRevalidate = loadStaleWhileRevalidate({
      cacheStorage: { open: vi.fn(async () => cache) },
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
      responseError,
    });

    const result = staleWhileRevalidate(request);

    await expect(result.response).resolves.toBe(errorResponse);
    await expect(result.revalidation).resolves.toBeUndefined();
    expect(responseError).toHaveBeenCalledTimes(1);
  });
});
