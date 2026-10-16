import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 direct tab drag RTL and hot-loop contract", () => {
  it("normalizes logical direction and bounds for Public and Organizer tabs", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("layoutDirection: V3LayoutDirection");
      expect(tabs).toContain("Math.min(firstDelta, lastDelta)");
      expect(tabs).toContain("Math.max(firstDelta, lastDelta)");
      expect(tabs).toContain("resolveV3LogicalHorizontalDelta(rawDelta, drag.layoutDirection)");
      expect(tabs).toContain("resolveV3LogicalHorizontalDelta(");
      expect(tabs).toContain("drag.velocityX,");
      expect(tabs).toContain("resolveV3PhysicalInlineSign(layoutDirection)");
      expect(tabs).toContain("data-layout-direction={layoutDirection}");
    }
  });

  it("does not dispatch preview React state on every pointer pixel", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(publicTabs).toContain("if (nextPreview !== drag.previewIndex)");
    expect(publicTabs).toContain("drag.previewIndex = nextPreview");
    expect(organizerTabs).toContain("if (previewIndex !== drag.previewIndex)");
    expect(organizerTabs).toContain("drag.previewIndex = previewIndex");
  });
});
