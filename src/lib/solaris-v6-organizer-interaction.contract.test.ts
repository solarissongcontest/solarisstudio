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
  });

  it("preserves the existing Organizer navigation-memory contract underneath V6 chrome", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    expect(frame).toContain("consumeAdminNavigationRestore");
    expect(frame).toContain("rememberAdminLocation");
    expect(frame).toContain("getAdminAppTabDestination");
    expect(frame).toContain("resetAdminAppTabToRoot");
    expect(frame).toContain("<OrganizerV6TabBar");
  });
});
