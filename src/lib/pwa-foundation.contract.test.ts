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
    const navigation = source("src/lib/app-navigation.ts");
    expect(tabs).toContain("PUBLIC_GLOBAL_AREAS");
    expect(tabs).toContain('area.id === "me"');
    expect(navigation).toContain('if (tab === "me" && !signedIn) return "/auth"');
    expect(navigation).toContain('me: "/my-solaris"');
    expect(tabs).not.toContain('"Sign in"');
    expect(tabs).toContain("downTravel");
    expect(tabs).toContain('data-collapsed={collapsed ? "true" : "false"}');
    expect(tabs).toContain("setCollapsed(false)");
  });

  it("renders the installed bottom navigation with the Kube-style SVG refraction pipeline", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const kube = source("src/components/app/KubeLiquidGlassBackdrop.tsx");
    const styles = source("src/styles/app-shell.css");

    expect(tabs).toContain("KubeLiquidGlassBackdrop");
    expect(kube).toContain("convexSquircle");
    expect(kube).toContain("squircleDerivative");
    expect(kube).toContain("RAY_SAMPLE_COUNT = 127");
    expect(kube).toContain("nGlass = 1.5");
    expect(kube).toContain("feDisplacementMap");
    expect(kube).toContain('xChannelSelector="R"');
    expect(kube).toContain('yChannelSelector="G"');
    expect(kube).toContain("feBlend");
    expect(kube).toContain("specularUrl");
    expect(kube).toContain("Math.round(highlight * 30)");
    expect(kube).toContain('stdDeviation="13.5"');
    expect(kube).toContain("scale={maps.scale * 0.7}");
    expect(kube).toContain('data-kube-liquid-glass={blink ? "svg-refraction" : "safari-mirrored-refraction"}');
    expect(kube).toContain('const backdropFilter = blink && maps ? `url(#${filterId})` : "none"');
    expect(kube).toContain("source.cloneNode(true)");
    expect(kube).toContain('document.querySelector<HTMLElement>(".app-main")');
    expect(kube).toContain("mirror.replaceChildren(clone)");
    expect(kube).toContain('"blur(22px) saturate(1.16) brightness(1.08) contrast(1.01)"');
    expect(kube).toContain("WebkitFilter: mirrorFilter");
    expect(kube).toContain("filter: mirrorFilter");
    expect(styles).toContain(".solaris-app-tabbar-backdrop");
    expect(styles).toContain(".solaris-kube-safari-mirror");
    expect(styles).toContain(".solaris-kube-mirror-clone");
    expect(styles).toContain('data-kube-liquid-glass="svg-refraction"');
    expect(styles).toContain('data-kube-liquid-glass="safari-mirrored-refraction"');
    expect(styles).toContain(".solaris-app-tabbar-material");
    expect(styles).toContain("background: transparent");
    expect(styles).toContain("background: rgb(238 241 245 / .075)");
    expect(styles).toContain("-webkit-backdrop-filter: none");
  });

  it("bumps the installed-app static cache when liquid glass rendering changes", () => {
    const worker = source("public/sw.js");
    expect(worker).toContain('const CACHE_VERSION = "solaris-app-v11"');
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
    expect(more).toContain("App settings");
    expect(more).toContain("Account & security");
    expect(more).not.toContain("publicDestinationsForArea");
  });

  it("keeps utility route titles route-aware in the installed app toolbar", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const chrome = source("src/lib/app-route-chrome.ts");
    expect(toolbar).toContain("resolveAppRouteChrome");
    expect(chrome).toContain("publicDestinationForPath");
    expect(chrome).toContain("destination.label");
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
    expect(offline).toContain("live server acknowledgement");
  });
});
