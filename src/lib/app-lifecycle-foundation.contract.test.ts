import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 lifecycle foundation", () => {
  it("connects lifecycle, connectivity, viewport and update safety through AppRuntime", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    expect(runtime).toContain("createAppLifecycleController");
    expect(runtime).toContain("createAppConnectivityController");
    expect(runtime).toContain("createAppViewportController");
    expect(runtime).toContain("appUpdateSafety(pathname)");
    expect(runtime).toContain("updateDeferred");
    expect(runtime).toContain("APP_RESUME_EVENT");
  });

  it("uses backend-aware connectivity instead of navigator.onLine inside confirmation safety", () => {
    const confirmation = source("src/components/ConfirmationForm.tsx");
    expect(confirmation).toContain("const { connectivity } = useSolarisApp()");
    expect(confirmation).toContain('connectivity.status !== "online"');
    expect(confirmation).not.toContain("navigator.onLine");
  });

  it("distinguishes offline, degraded and Supabase service-restricted states", () => {
    const connectivity = source("src/lib/app-connectivity.ts");
    const restriction = source("src/lib/supabase-service-restriction.ts");
    expect(connectivity).toContain('"offline"');
    expect(connectivity).toContain('"degraded"');
    expect(connectivity).toContain('"service-restricted"');
    expect(connectivity).toContain("APP_RESUME_EVENT");
    expect(connectivity).toContain("probeGeneration");
    expect(connectivity).toContain("generation !== probeGeneration");
    expect(connectivity).toContain("probeController?.abort()");
    expect(restriction).toContain("SUPABASE_SERVICE_RECOVERED_EVENT");
  });

  it("hydrates connectivity from deterministic HTML before reading browser-only state", () => {
    const connectivity = source("src/lib/app-connectivity.ts");
    const runtime = source("src/components/app/AppRuntime.tsx");
    expect(connectivity).toContain("hydrationSafeAppConnectivitySnapshot");
    expect(connectivity).toContain('status: "online"');
    expect(connectivity).toContain("serviceRestricted: false");
    expect(runtime).toContain("hydrationSafeAppConnectivitySnapshot()");
    expect(runtime).toContain("createAppConnectivityController(setConnectivity)");
  });

  it("derives offline recovery language from the canonical screen policy", () => {
    const banner = source("src/components/app/AppOfflineBanner.tsx");
    const registry = source("src/lib/app-screen-registry.ts");
    expect(banner).toContain("resolveSolarisAppScreen(pathname, searchStr)");
    expect(banner).toContain('screen.behavior.offline === "online-required"');
    expect(banner).toContain('screen.behavior.offline === "ready"');
    expect(registry).toContain('offline: "online-required"');
    expect(registry).toContain('offline: "ready"');
    expect(registry).toContain('offline: "readable"');
  });

  it("reserves content below the measured floating tab bar", () => {
    const styles = source("src/styles/app-shell.css");
    expect(styles).toContain("max(2.7rem, env(safe-area-inset-bottom))");
    expect(styles).toContain("var(--solaris-bottom-obstruction) + 2rem");
    expect(styles).toContain("var(--solaris-keyboard-inset) +");
  });

  it("uses VisualViewport to make installed chrome keyboard-aware", () => {
    const viewport = source("src/lib/app-viewport.ts");
    const styles = source("src/styles/app-shell.css");
    expect(viewport).toContain("window.visualViewport");
    expect(viewport).toContain("--solaris-keyboard-inset");
    expect(viewport).toContain("data-solaris-keyboard-open");
    expect(styles).toContain('html[data-solaris-keyboard-open] .solaris-app-tabbar');
    expect(styles).toContain('html[data-solaris-keyboard-open] .solaris-app-update');
  });

  it("never offers a service-worker reload while a route is safety-blocked", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const manager = source("src/components/app/AppOverlayManager.tsx");
    expect(runtime).toContain("if (!waitingWorker || !updateSafety.safe) return");
    expect(runtime).toContain("updateSafe={updateSafety.safe}");
    expect(manager).toContain("updateAvailable && updateSafe");
  });
});
