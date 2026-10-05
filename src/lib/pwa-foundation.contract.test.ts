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
    const scrollPhysics = source("src/lib/use-scroll-responsive-bar.ts");
    const navigation = source("src/lib/app-navigation.ts");
    expect(tabs).toContain("PUBLIC_GLOBAL_AREAS");
    expect(tabs).toContain('area.id === "me"');
    expect(navigation).toContain('if (tab === "me" && !signedIn) return "/auth"');
    expect(navigation).toContain('me: "/my-solaris"');
    expect(tabs).not.toContain('"Sign in"');
    expect(tabs).toContain("useScrollResponsiveBar");
    expect(scrollPhysics).toContain("downTravel");
    expect(scrollPhysics).toContain("resolveScrollResponsiveBar");
    expect(scrollPhysics).toContain("setCollapsedState(false)");
    expect(tabs).toContain('data-collapsed={collapsed ? "true" : "false"}');
  });

  it("renders bounded liquid glass with SVG refraction on Blink and a safe CSS fallback on WebKit", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const kube = source("src/components/app/KubeLiquidGlassBackdrop.tsx");
    const styles = source("src/styles/app-shell.css");

    expect(tabs).toContain("KubeLiquidGlassBackdrop");
    expect(tabs).toContain("--solaris-app-bottom-obstruction");
    expect(tabs).not.toContain('root.style.setProperty("--solaris-app-tabbar-height"');

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
    expect(kube).toContain('data-kube-liquid-glass={blink ? "svg-refraction" : "css-backdrop"}');
    expect(kube).toContain('const backdropFilter = blink && maps ? `url(#${filterId})` : "none"');
    expect(kube).toContain('"blur(22px) saturate(1.16) brightness(1.08) contrast(1.01)"');
    expect(kube).not.toContain("source.cloneNode(true)");
    expect(kube).not.toContain('document.querySelector<HTMLElement>(".app-main")');
    expect(kube).not.toContain("MutationObserver");

    expect(styles).toContain(".solaris-app-tabbar-backdrop");
    expect(styles).toContain('data-kube-liquid-glass="svg-refraction"');
    expect(styles).toContain('data-kube-liquid-glass="css-backdrop"');
    expect(styles).not.toContain(".solaris-kube-safari-mirror");
    expect(styles).not.toContain(".solaris-kube-mirror-clone");
    expect(styles).toContain("--solaris-app-tabbar-max-height");
    expect(styles).toContain("contain: layout paint");
    expect(styles).toContain(".solaris-app-tabbar-material");
    expect(styles).toContain("background: transparent");
    expect(styles).toContain("background: rgb(238 241 245 / .075)");
    expect(styles).toContain("-webkit-backdrop-filter: none");
  });

  it("bumps the installed-app static cache when liquid glass rendering changes", () => {
    const worker = source("public/sw.js");
    expect(worker).toContain('const CACHE_VERSION = "solaris-app-v15"');
  });

  it("lets the active tab indicator drag across destinations", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const physics = source("src/lib/interaction-physics.ts");
    expect(tabs).toContain("data-app-tab-index");
    expect(tabs).toContain("setPointerCapture");
    expect(tabs).toContain("--solaris-tab-drag-x");
    expect(tabs).toContain('source: "app_tabbar_drag"');
    expect(tabs).toContain("resolveTabDragTargetIndex");
    expect(tabs).toContain("activationRatio: 0.72");
    expect(tabs).toContain("dragging ? activeIndex");
    expect(tabs).toContain("--solaris-tab-drag-scale-x");
    expect(tabs).toContain("--solaris-tabbar-pull-width");
    expect(tabs).toContain("--solaris-tabbar-pull-height");
    expect(tabs).toContain("resolveElasticDrag");
    expect(physics).toContain("scaleX:");
    expect(physics).toContain("growWidth:");
    expect(physics).toContain("growHeight:");
    expect(physics).toContain("stretch.standard");
  });

  it("keeps Explore personalized content separated from the next section", () => {
    const explore = source("src/routes/explore/index.tsx");
    const styles = source("src/styles/app-shell.css");
    expect(explore).toContain('className="public-hub-section"');
    expect(styles).toContain("[data-solaris-app-explore-personalized] + .public-hub-section");
  });

  it("uses a bottom utility sheet instead of duplicating section navigation", () => {
    const shell = source("src/components/AppShell.tsx");
    const draggable = source("src/components/interaction/SolarisDraggableSheet.tsx");
    const more = source("src/components/app/AppMoreNavigation.tsx");
    expect(shell).toContain("SolarisDraggableSheetContent");
    expect(shell).toContain('side="right"');
    expect(draggable).toContain("<SheetContent");
    expect(draggable).toContain('side="bottom"');
    expect(more).toContain("All Solaris pages");
    expect(more).toContain("App settings");
    expect(more).toContain("Account & security");
    expect(more).not.toContain("publicDestinationsForArea");
  });

  it("keeps utility route titles route-aware through the canonical screen registry", () => {
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const chrome = source("src/lib/app-route-chrome.ts");
    const registry = source("src/lib/app-screen-registry.ts");
    expect(toolbar).toContain("resolveAppRouteChrome");
    expect(chrome).toContain("resolveSolarisAppScreen");
    expect(chrome).not.toContain("publicDestinationForPath");
    expect(registry).toContain("publicDestinationForPath");
    expect(registry).toContain("destination.label");
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
