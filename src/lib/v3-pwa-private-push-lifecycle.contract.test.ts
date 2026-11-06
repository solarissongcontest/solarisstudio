import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("v16 service worker preserves security and lifecycle boundaries", () => {
  const sw = readFileSync("public/sw.js", "utf8");

  it("bounds static asset revalidation to the fetch event lifetime", () => {
    expect(sw).toContain('const CACHE_VERSION = "solaris-app-v16"');
    expect(sw).toContain('const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`');
    expect(sw).toContain("MAX_RUNTIME_CACHE_ENTRIES = 96");
    expect(sw).toContain("event.waitUntil(revalidation)");
    expect(sw).toContain("await cache.put(request, response.clone())");
    expect(sw).toContain("await trimRuntimeCache(cache)");
  });

  it("never caches navigational HTML or changes the maintenance fallback", () => {
    const part = sw.slice(
      sw.indexOf("async function networkNavigation"),
      sw.indexOf("async function trimRuntimeCache"),
    );
    expect(part).toContain("return await fetch(request)");
    expect(part).not.toContain("cache.put");
    expect(part).toContain("caches.match(OFFLINE_URL)");
  });

  it("keeps current private-world notifications sanitized while awaiting opens", () => {
    expect(sw).toContain('sensitivity === "private"');
    expect(sw).toContain('"world-private"');
    expect(sw).toContain("normalizePushRoute(event.notification.data?.route)");
    expect(sw).toContain("openOrFocusPushTarget(target)");
    expect(sw).not.toContain("client.navigate?.(target)");
  });
});
