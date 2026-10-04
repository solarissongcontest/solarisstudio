import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 application shell convergence", () => {
  it("drives Public and Participant app chrome from the shared AppShell screen contract", () => {
    const shell = source("src/components/AppShell.tsx");

    expect(shell).toContain("resolveSolarisAppScreen");
    expect(shell).toContain("<MySolarisWorkspaceShell");
    expect(shell).toContain("<AppToolbar");
    expect(shell).toContain("<AppTabBar");
    expect(shell).toContain("appScreen.chrome.toolbar");
    expect(shell).toContain("appScreen.behavior.criticalTask");
  });

  it("drives Organizer chrome from its V6 screen contract without restoring AdminFrame ownership", () => {
    const adminShell = source("src/components/admin/AdminShell.tsx");
    const frame = source("src/components/admin/AdminFrame.tsx");
    const mobileChrome = source(
      "src/components/admin/OrganizerV6MobileChrome.tsx",
    );

    expect(adminShell).toContain("resolveOrganizerV6Screen");
    expect(adminShell).toContain("<OrganizerV6MobileChrome />");
    expect(mobileChrome).toContain("resolveOrganizerV6Screen");
    expect(frame).not.toContain("OrganizerV6TabBar");
    expect(frame).not.toContain("consumeAdminNavigationRestore");
  });

  it("shares overlay, viewport, keyboard and bottom-obstruction ownership across perspectives", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const overlays = source("src/components/app/AppOverlayManager.tsx");
    const metrics = source("src/components/app/AppChromeMetrics.tsx");
    const publicTabs = source("src/components/app/AppTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(runtime).toContain("<AppOverlayManager");
    expect(overlays).toContain("<AppChromeMetrics />");
    expect(metrics).toContain("--solaris-keyboard-inset");
    expect(metrics).toContain("--solaris-safe-bottom");
    expect(publicTabs).toContain("--solaris-bottom-obstruction");
    expect(organizerTabs).toContain("--solaris-bottom-obstruction");
  });
});
