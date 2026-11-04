import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("registry-owned app overlay and resume consumers", () => {
  it("keeps install and first-run overlays out of canonical critical/immersive work", () => {
    const install = source("src/components/app/AppInstallPrompt.tsx");
    const firstRun = source("src/components/app/AppFirstRun.tsx");

    for (const code of [install, firstRun]) {
      expect(code).toContain("resolveSolarisAppScreen(pathname)");
      expect(code).toContain("screen.behavior.criticalTask");
      expect(code).toContain("screen.behavior.immersive");
      expect(code).not.toContain('pathname.startsWith("/confirmations")');
      expect(code).not.toContain('pathname.startsWith("/jury-voting")');
      expect(code).not.toContain('pathname.startsWith("/televoting")');
      expect(code).not.toContain('pathname.startsWith("/next-in-line")');
    }
  });

  it("actively closes first-run onboarding when protected work takes ownership", () => {
    const firstRun = source("src/components/app/AppFirstRun.tsx");
    expect(firstRun).toContain("if (!isAppMode || !appFirstRunAllowedOnPath(pathname)) {");
    expect(firstRun).toContain("setOpen(false)");
  });

  it("records critical-task resume telemetry from the canonical screen registry", () => {
    const telemetry = source("src/components/app/AppTelemetryBridge.tsx");
    expect(telemetry).toContain("resolveSolarisAppScreen(pathname)");
    expect(telemetry).toContain("screen.behavior.criticalTask");
    expect(telemetry).toContain('screen.hierarchy.rootTab ?? "app"');
    expect(telemetry).not.toContain("TASK_ROUTE");
  });
});
