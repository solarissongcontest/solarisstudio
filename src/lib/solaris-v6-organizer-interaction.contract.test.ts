import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 Organizer interaction parity", () => {
  it("uses the V6 interaction physics for Organizer mobile navigation", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");
    expect(organizer).toContain("useScrollResponsiveBar");
    expect(organizer).toContain("resolveElasticDrag");
    expect(organizer).toContain("KubeLiquidGlassBackdrop");
    expect(organizer).toContain("onPointerCancel");
    expect(organizer).toContain("onLostPointerCapture");
    expect(organizer).toContain("data-mode={mode}");
    expect(organizer).toContain('if (mode === "hidden") return null;');
  });

  it("preserves the existing Organizer navigation-memory contract underneath V6 chrome", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    expect(frame).toContain("consumeAdminNavigationRestore");
    expect(frame).toContain("rememberAdminLocation");
    expect(frame).toContain("getAdminAppTabDestination");
    expect(frame).toContain("resetAdminAppTabToRoot");
    expect(frame).toContain("<OrganizerV6TabBar");
    expect(frame).toContain("resolveOrganizerV6Screen");
    expect(frame).toContain("mode={screen.tabbar}");
    expect(frame).toContain("runAppViewTransition");
  });

  it("drives Organizer toolbar presentation from the shared V6 screen contract", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(shell).toContain("resolveOrganizerV6Screen");
    expect(shell).toContain("data-screen-id={screen.id}");
    expect(shell).toContain("data-screen-presentation={screen.presentation}");
    expect(shell).toContain("data-toolbar-mode={screen.toolbar}");
  });
});
