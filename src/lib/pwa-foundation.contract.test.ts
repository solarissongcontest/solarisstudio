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
  });

  it("never turns maintenance into stale cached application HTML", () => {
    const worker = source("public/sw.js");
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain("return await fetch(request)");
    expect(worker).not.toMatch(/cache\.put\(request.+navigate/s);
    expect(worker).not.toContain("caches.match(request)");
  });

  it("has an explicit offline fallback without offline mutation queueing", () => {
    const worker = source("public/sw.js");
    const offline = source("public/offline.html");
    expect(worker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(worker).toContain('request.method !== "GET"');
    expect(offline).toContain("Official submissions are never queued");
  });
});
