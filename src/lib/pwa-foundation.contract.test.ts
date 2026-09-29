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

  it("renders the installed bottom navigation as transparent liquid glass", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const styles = source("src/styles/app-shell.css");
    expect(tabs).not.toContain('id="solaris-liquid-glass-refraction"');
    expect(tabs).not.toContain("feDisplacementMap");
    expect(styles).not.toContain('url("#solaris-liquid-glass-refraction")');
    expect(styles).toContain("-webkit-backdrop-filter: blur(64px)");
    expect(styles).toContain("backdrop-filter: blur(64px)");
    expect(styles).toContain("rgb(255 255 255 / .055)");
    expect(styles).toContain("mask-composite: exclude");
    expect(styles).not.toContain("linear-gradient(145deg, rgb(10 29 55 / .90), rgb(4 18 40 / .90))");
    expect(tabs).not.toContain('className="solaris-app-tabbar-glass"');
    expect(styles).not.toContain(".solaris-app-tabbar-glass");
    expect(styles).toContain(".solaris-app-tabbar-material");
    expect(styles).toContain("isolation: isolate");
    expect(styles).toContain("overflow: hidden");
    expect(styles).toContain(".solaris-app-tab-indicator");
    expect(styles).toContain("background: transparent");
    expect(styles).toContain("background: rgb(220 224 230 / .135)");
    expect(styles).toContain("-webkit-backdrop-filter: none");
    expect(styles).not.toContain('@supports (backdrop-filter: url(');
  });

  it("bumps the installed-app static cache when liquid glass rendering changes", () => {
    const worker = source("public/sw.js");
    expect(worker).toContain('const CACHE_VERSION = "solaris-app-v3"');
  });

  it("lets the active tab indicator drag across destinations", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    expect(tabs).toContain("data-app-tab-index");
    expect(tabs).toContain("setPointerCapture");
    expect(tabs).toContain("--solaris-tab-drag-x");
    expect(tabs).toContain('source: "app_tabbar_drag"');
    expect(tabs).toContain("nearestTabIndex");
    expect(tabs).toContain("--solaris-tab-drag-scale-x");
    expect(tabs).toContain("--solaris-tabbar-pull-width");
    expect(tabs).toContain("--solaris-tabbar-pull-height");
    expect(tabs).toContain("indicatorStretch");
    expect(tabs).toContain("barGrowWidth");
    expect(tabs).toContain("barGrowHeight");
  });

  it("keeps Explore personalized content separated from the next section", () => {
    const explore = source("src/routes/explore/index.tsx");
    const styles = source("src/styles/app-shell.css");
    expect(explore).toContain('className="public-hub-section"');
    expect(styles).toContain("[data-solaris-app-explore-personalized] + .public-hub-section");
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
