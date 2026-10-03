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

  it("preserves navigation memory in the canonical V6 mobile chrome owner", () => {
    const chrome = source("src/components/admin/OrganizerV6MobileChrome.tsx");
    expect(chrome).toContain("consumeAdminNavigationRestore");
    expect(chrome).toContain("rememberAdminLocation");
    expect(chrome).toContain("getAdminAppTabDestination");
    expect(chrome).toContain("resetAdminAppTabToRoot");
    expect(chrome).toContain("<OrganizerV6TabBar");
    expect(chrome).toContain("resolveOrganizerV6Screen");
    expect(chrome).toContain("mode={screen.tabbar}");
    expect(chrome).toContain("runAppViewTransition");
  });

  it("keeps AdminFrame layout-only instead of owning a competing mobile shell", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(frame).not.toContain("OrganizerV6TabBar");
    expect(frame).not.toContain("consumeAdminNavigationRestore");
    expect(frame).not.toContain("adminAppTabRoot");
    expect(shell).toContain("<OrganizerV6MobileChrome />");
  });

  it("drives Organizer toolbar presentation from the shared V6 screen contract", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(shell).toContain("resolveOrganizerV6Screen");
    expect(shell).toContain("data-screen-id={screen.id}");
    expect(shell).toContain("data-screen-presentation={screen.presentation}");
    expect(shell).toContain("data-toolbar-mode={screen.toolbar}");
  });
});
