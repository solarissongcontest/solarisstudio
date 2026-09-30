import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 launch and offline continuity", () => {
  it("routes only Home Screen launches through the restoration entry point", () => {
    const manifest = source("public/site.webmanifest");
    const launch = source("src/routes/app-launch.tsx");
    expect(manifest).toContain('"start_url": "/app-launch"');
    expect(launch).toContain('createFileRoute("/app-launch")');
    expect(launch).toContain("getAppLaunchRestoreCandidate");
    expect(launch).toContain("markAppNavigationRestore");
    expect(launch).toContain('replace: true');
  });

  it("keeps transient tasks, auth and live surfaces out of cold-launch restoration", () => {
    const navigation = source("src/lib/app-navigation.ts");
    expect(navigation).toContain("confirmations|jury-voting|televoting|next-in-line");
    expect(navigation).toContain("app-launch|auth|reset|recover");
    expect(navigation).toContain("show-mode");
    expect(navigation).toContain("APP_LAUNCH_RESTORE_MAX_AGE_MS");
  });

  it("uses a real app-like offline shell without caching stale navigation HTML", () => {
    const offline = source("public/offline.html");
    const worker = source("public/sw.js");
    expect(offline).toContain('class="tabbar"');
    expect(offline).toContain('data-tab="explore"');
    expect(offline).toContain("solaris:offline-public-index:v1");
    expect(offline).toContain("Official submissions are never queued");
    expect(offline).toContain("live server acknowledgement");
    expect(offline).toContain('window.addEventListener("online"');
    expect(worker).toContain('const CACHE_VERSION = "solaris-app-v11"');

    const navigation = worker.slice(
      worker.indexOf("async function networkNavigation"),
      worker.indexOf("async function staleWhileRevalidate"),
    );
    expect(navigation).toContain("return await fetch(request)");
    expect(navigation).not.toContain("cache.put");
    expect(navigation).not.toContain("caches.match(request)");
  });

  it("does not expose personal account data through the offline fallback", () => {
    const offline = source("public/offline.html");
    expect(offline).toContain("Personal data protected");
    expect(offline).toContain("does not expose account or delegation data");
  });
});
