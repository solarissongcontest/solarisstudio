import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Organizer morphology ownership", () => {
  it("lets V3 canonical roots override legacy V6 compact classification", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");

    expect(chrome).toContain("resolveV3OrganizerTabbarMode(pathname, legacyScreen.tabbar)");
    expect(chrome).toContain('if (tabbarMode === "hidden") return null');
    expect(chrome).toContain("data-organizer-v3-tabbar-mode={tabbarMode}");
    expect(chrome).not.toContain("data-organizer-v3-tabbar-mode={screen.tabbar}");
  });

  it("keeps the canonical shared Liquid bar rather than reviving Organizer V6 navigation", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");

    expect(chrome).toContain("V3LiquidTabBar");
    expect(chrome).not.toContain("OrganizerV6TabBar");
    expect(chrome).toContain("V3_ORGANIZER_TAB_ORDER.map");
  });
});
