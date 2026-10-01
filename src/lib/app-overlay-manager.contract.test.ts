import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("app overlay manager", () => {
  it("routes transient app UI through one manager", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    expect(runtime).toContain("<AppOverlayManager");
    expect(runtime).not.toContain("<AppInstallPrompt");
    expect(runtime).not.toContain("<AppOfflineBanner");
    expect(runtime).not.toContain("<AppUpdatePrompt");
    expect(runtime).not.toContain("<AppFirstRun");
  });

  it("uses one explicit priority order for transient surfaces", () => {
    const manager = source("src/components/app/AppOverlayManager.tsx");
    const connectivity = manager.indexOf('connectivity.status !== "online"');
    const firstRun = manager.indexOf("!firstRunComplete");
    const update = manager.indexOf("updateAvailable && updateSafe");

    expect(connectivity).toBeGreaterThan(-1);
    expect(firstRun).toBeGreaterThan(connectivity);
    expect(update).toBeGreaterThan(firstRun);
    expect(manager).toContain("<AppInstallPrompt");
    expect(manager).toContain("<AppOfflineBanner");
    expect(manager).toContain("<AppFirstRun");
    expect(manager).toContain("<AppUpdatePrompt");
  });

  it("does not let first-run completion get lost behind later overlays", () => {
    const firstRun = source("src/components/app/AppFirstRun.tsx");
    expect(firstRun).toContain("appFirstRunComplete");
    expect(firstRun).toContain("onComplete?.()");
    expect(firstRun).toContain("APP_FIRST_RUN_COMPLETE_KEY");
  });
});
