import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris installed-app foundation", () => {
  it("keeps one web product while detecting standalone app mode explicitly", () => {
    const platform = source("src/lib/platform.ts");
    const runtime = source("src/components/app/AppRuntime.tsx");
    expect(platform).toContain('(display-mode: standalone)');
    expect(platform).toContain("navigator");
    expect(runtime).toContain('register("/sw.js"');
    expect(runtime).toContain('data-solaris-app');
  });

  it("uses the stable five-area app navigation with Me as a permanent label", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    expect(tabs).toContain("PUBLIC_GLOBAL_AREAS");
    expect(tabs).toContain('area.id === "me"');
    expect(tabs).toContain('signedIn ? "/my-solaris" : "/auth"');
    expect(tabs).not.toContain('"Sign in"');
    expect(tabs).toContain("downTravel");
    expect(tabs).toContain('data-collapsed={collapsed ? "true" : "false"}');
    expect(tabs).toContain("setCollapsed(false)");
  });

  it("uses a bottom utility sheet instead of duplicating section navigation", () => {
    const shell = source("src/components/AppShell.tsx");
    const more = source("src/components/app/AppMoreNavigation.tsx");
    expect(shell).toContain('side={isAppMode ? "bottom" : "right"}');
    expect(more).toContain("All Solaris pages");
    expect(more).toContain("Account & settings");
    expect(more).not.toContain("publicDestinationsForArea");
  });

  it("keeps utility route titles route-aware in the installed app toolbar", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    expect(toolbar).toContain("publicDestinationForPath");
    expect(toolbar).toContain("destination.label");
  });

  it("never turns maintenance into stale cached application HTML", () => {
    const worker = source("public/sw.js");
    const navigation = worker.slice(
      worker.indexOf("async function networkNavigation"),
      worker.indexOf("async function staleWhileRevalidate"),
    );
    expect(worker).toContain('request.mode === "navigate"');
    expect(navigation).toContain("return await fetch(request)");
    expect(navigation).not.toContain("cache.put");
    expect(navigation).not.toContain("caches.match(request)");
  });

  it("has an explicit offline fallback without offline mutation queueing", () => {
    const worker = source("public/sw.js");
    const offline = source("public/offline.html");
    expect(worker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(worker).toContain('request.method !== "GET"');
    expect(offline).toContain("Official submissions are never queued");
  });
});
