import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V3 PWA shell lifecycle", () => {
  const rootRoute = source("src/routes/__root.tsx");
  const runtime = source("src/components/app/AppRuntime.tsx");
  const lifecycle = source("src/lib/app-lifecycle.ts");
  const viewport = source("src/lib/app-viewport.ts");
  const updateSafety = source("src/lib/app-update-safety.ts");
  const freshness = source("src/components/app/AppDataFreshnessCoordinator.tsx");
  const reconnect = source("src/components/app/AppReconnectReconciler.tsx");
  const restore = source("src/components/app/AppLaunchRestoreCoordinator.tsx");
  const appStyles = source("src/styles/app-shell.css");
  const worker = source("public/sw.js");
  const offline = source("public/offline.html");

  it("protects standalone cold-launch first paint until runtime platform detection owns the shell", () => {
    expect(rootRoute).toContain("data-solaris-app-boot");
    expect(rootRoute).toContain("navigator.standalone === true");
    expect(rootRoute).toContain('root.dataset.solarisRuntime = "standalone"');
    expect(runtime).toContain('root.removeAttribute("data-solaris-app-boot")');
    expect(appStyles).toContain('html[data-solaris-app-boot] body > *');
    expect(appStyles).toContain('html[data-solaris-app-boot] body::before');
  });

  it("restores canonical app lifecycle after backgrounding without inventing a second state machine", () => {
    expect(lifecycle).toContain("APP_RESUME_EVENT");
    expect(lifecycle).toContain("backgroundDurationMs");
    expect(lifecycle).toContain('window.addEventListener("pageshow"');
    expect(lifecycle).toContain('document.addEventListener("visibilitychange"');
    expect(runtime).toContain("createAppLifecycleController");
    expect(runtime).toContain("APP_RESUME_EVENT");
  });

  it("reprojects viewport and keyboard geometry on orientation/VisualViewport changes", () => {
    expect(runtime).toContain("createAppViewportController");
    expect(viewport).toContain('window.addEventListener("orientationchange", schedule)');
    expect(viewport).toContain('visual?.addEventListener("resize", schedule)');
    expect(viewport).toContain('visual?.addEventListener("scroll", schedule)');
    expect(viewport).toContain("--solaris-visual-viewport-width");
    expect(viewport).toContain("--solaris-visual-viewport-height");
    expect(viewport).toContain("--solaris-keyboard-inset");
    expect(viewport).toContain("data-solaris-keyboard-open");
  });

  it("revalidates read models on resume and reconnect without replaying critical mutations", () => {
    expect(freshness).toContain("freshnessLevelsForResume");
    expect(freshness).toContain('refetchType: "active"');
    expect(reconnect).toContain("APP_CONNECTIVITY_RECOVERED_EVENT");
    expect(reconnect).toContain('chrome.archetype === "task"');
    expect(reconnect).toContain('chrome.archetype === "immersive"');
    expect(reconnect).toContain("queryClient.invalidateQueries");
    expect(reconnect).not.toContain("mutate");
  });

  it("defers service-worker activation/reload while critical or in-flight work owns update safety", () => {
    expect(updateSafety).toContain("setAppUpdateBlocker");
    expect(updateSafety).toContain("routeUpdateBlocker");
    expect(updateSafety).toContain("criticalTask");
    expect(runtime).toContain("controllerReloadPending");
    expect(runtime).toContain("!updateSafetyRef.current.safe");
    expect(runtime).toContain("waitingWorker.postMessage({ type: \"SKIP_WAITING\" })");
    expect(runtime).toContain("updateDeferred: updateAvailable && !updateSafety.safe");
  });

  it("restores the last safe navigation destination only after session restoration resolves", () => {
    expect(restore).toContain("resolveAppLaunchSession");
    expect(restore).toContain("supabase.auth.getSession");
    expect(restore).toContain("getAppLaunchDestinationFromSnapshot");
    expect(restore).toContain("getAppLaunchSafeRootFromSnapshot");
    expect(restore).toContain("markAppNavigationRestore");
    expect(restore).toContain("window.location.replace");
  });

  it("keeps navigational HTML network-first and only falls back to the read-only offline shell", () => {
    expect(worker).toContain('const CACHE_VERSION = "solaris-app-v16"');
    expect(worker).toContain('const OFFLINE_URL = "/offline.html"');
    expect(worker).toContain("OFFLINE_URL,");
    expect(worker).toContain('if (request.mode === "navigate")');
    expect(worker).toContain("return await fetch(request)");
    expect(worker).toContain("caches.match(OFFLINE_URL)");
    expect(worker).toContain('if (request.method !== "GET") return');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).not.toContain("sync.register");
  });

  it("never turns offline mode into delayed official submission authority", () => {
    expect(offline).toContain("Read-only app mode");
    expect(offline).toContain("Official actions are paused");
    expect(offline).toContain("nothing will be silently submitted later");
    expect(offline).toContain("Official submissions are never queued");
    expect(offline).toContain("Reconnect for official results");
  });

  it("keeps the fallback shell viewport-safe, phone-scopes its defensive top minimum, and preserves the canonical five public areas", () => {
    expect(offline).toContain("viewport-fit=cover");
    expect(offline).toContain("--offline-safe-content-top");
    expect(offline).toContain('data-solaris-ios-standalone="true"');
    expect(offline).toContain("@media (orientation: portrait) and (max-width: 767px)");
    expect(offline).not.toContain("@media (orientation: landscape)");
    expect(offline).toContain("--offline-safe-bottom");
    expect(offline).toContain("min-height: 44px");
    expect(offline).toContain("prefers-reduced-transparency: reduce");
    for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
      expect(offline).toContain(`>${label}</a>`);
    }
  });

  it("uses link semantics for offline navigation instead of pretending links are tabs", () => {
    expect(offline).toContain('node.setAttribute("aria-current", "page")');
    expect(offline).toContain('node.removeAttribute("aria-current")');
    expect(offline).not.toContain('aria-selected="false"');
    expect(offline).not.toContain('node.setAttribute("aria-selected"');
  });
});
