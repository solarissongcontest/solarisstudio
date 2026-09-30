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
    expect(restriction).toContain("SUPABASE_SERVICE_RECOVERED_EVENT");
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
    expect(runtime).toContain("waitingWorker && updateSafety.safe");
    expect(runtime).toContain("if (!waitingWorker || !updateSafety.safe) return");
  });
});
