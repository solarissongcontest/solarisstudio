import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_FRESHNESS_PATH,
  MAINTENANCE_FRESHNESS_POLL_MS,
  attachMaintenanceFreshness,
  maintenanceFreshnessResponse,
  renderMaintenanceFreshnessClient,
} from "./maintenance-freshness";

describe("maintenance access deployment freshness", () => {
  it("polls only the same-origin Worker version endpoint and reloads on a new deploy", () => {
    const client = renderMaintenanceFreshnessClient("worker-version-1");

    expect(MAINTENANCE_FRESHNESS_PATH).toBe("/__maintenance-admin/version");
    expect(MAINTENANCE_FRESHNESS_POLL_MS).toBe(15_000);
    expect(client).toContain('data-solaris-maintenance-freshness');
    expect(client).toContain('const currentVersion = "worker-version-1"');
    expect(client).toContain('const endpoint = "/__maintenance-admin/version"');
    expect(client).toContain('cache: "no-store"');
    expect(client).toContain('credentials: "same-origin"');
    expect(client).toContain("payload.version !== currentVersion");
    expect(client).toContain("window.location.reload()");
    expect(client).toContain('window.addEventListener("focus"');
    expect(client).toContain('document.addEventListener("visibilitychange"');
    expect(client).not.toContain("supabase");
    expect(client).not.toContain("/rest/v1/");
  });

  it("injects freshness only into HTML and prevents a bypassed page from being cached", async () => {
    const response = new Response("<html><body>Solaris</body></html>", {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        etag: '"old"',
      },
    });

    const fresh = await attachMaintenanceFreshness(response, "worker-version-2");
    const html = await fresh.text();

    expect(html).toContain("Solaris");
    expect(html).toContain("data-solaris-maintenance-freshness");
    expect(html).toContain("worker-version-2");
    expect(fresh.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(fresh.headers.get("pragma")).toBe("no-cache");
    expect(fresh.headers.get("etag")).toBeNull();

    const json = new Response('{"ok":true}', {
      headers: { "content-type": "application/json" },
    });
    expect(await attachMaintenanceFreshness(json, "worker-version-2")).toBe(json);
  });

  it("serves a tiny no-store version response without any application data access", async () => {
    const get = maintenanceFreshnessResponse("GET", "worker-version-3");
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await get.json()).toEqual({ version: "worker-version-3" });

    const head = maintenanceFreshnessResponse("HEAD", "worker-version-3");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const post = maintenanceFreshnessResponse("POST", "worker-version-3");
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });
});
