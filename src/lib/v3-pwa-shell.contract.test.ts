import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 PWA shell integration contract", () => {
  it("keeps one canonical cross-platform standalone detector", () => {
    const platform = source("src/lib/platform.ts");
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(platform).toContain("isStandaloneDisplayMode");
    expect(platform).toContain('(display-mode: standalone)');
    expect(platform).toContain("window.matchMedia");
    expect(platform).toContain("navigator as IOSNavigator");
    expect(platform).toContain(".standalone");
    expect(shell).not.toContain("display-mode: standalone");
    expect(shell).not.toContain("navigator.standalone");
  });

  it("uses the shared visualViewport keyboard signal instead of calculating another viewport model", () => {
    const viewport = source("src/lib/app-viewport.ts");
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(viewport).toContain("window.visualViewport");
    expect(viewport).toContain('data-solaris-keyboard-open');
    expect(publicTabs).toContain('data-solaris-keyboard-open');
    expect(organizerTabs).toContain('data-solaris-keyboard-open');
  });

  it("defers service-worker activation while critical V3 work is mounted", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const safety = source("src/lib/app-update-safety.ts");
    const focused = source("src/components/v3/V3FocusedTaskShell.tsx");

    expect(runtime).toContain("appUpdateSafety");
    expect(runtime).toContain("subscribeAppUpdateSafety");
    expect(runtime).toContain("updateDeferred");
    expect(runtime).toContain("controllerchange");
    expect(runtime).toContain("if (!waitingWorker || !updateSafety.safe) return");
    expect(safety).toContain("readAppUpdateBlockers");
    expect(safety).toContain("setAppUpdateBlocker");
    expect(focused).toContain("setAppUpdateBlocker");
    expect(focused).toContain("clearAppUpdateBlocker");
  });

  it("revalidates freshness on resume/reconnect without making navigation own domain truth", () => {
    const freshness = source("src/components/app/AppDataFreshnessCoordinator.tsx");
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(freshness).toContain("APP_RESUME_EVENT");
    expect(freshness).toContain("freshnessLevelsForResume");
    expect(freshness).toContain('refetchType: "active"');
    expect(shell).not.toContain("invalidateQueries");
    expect(shell).not.toContain("supabase");
  });

  it("retains the established offline shell without fabricating authoritative completion", () => {
    const overlay = source("src/components/app/AppOverlayManager.tsx");
    const offline = source("src/components/app/AppOfflineBanner.tsx");

    expect(overlay).toContain("<AppOfflineBanner");
    expect(offline).toContain("nothing is submitted until you reconnect");
    expect(offline).toContain("never treated as a submission");
  });
});
