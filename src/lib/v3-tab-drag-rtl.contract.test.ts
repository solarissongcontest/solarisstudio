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
      expect(tabs).toContain("data-layout-direction={layoutDirection}");
    }
  });

  it("keeps Public and Organizer lenses physical while materials inherit RTL", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const publicCss = source("src/styles/v3-liquid-tabbar.css");
    const fixedCss = source("src/styles/v3-navigation-fixed-geometry.css");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const organizerCss = source("src/styles/v3-organizer-navigation.css");

    expect(publicTabs).toContain("const physicalLensIndex =");
    expect(publicTabs).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualLensIndex : visualLensIndex',
    );
    expect(publicTabs).toContain('direction: "ltr"');
    expect(publicTabs).toContain("${physicalLensIndex} * (100% + 2px)");
    expect(publicTabs).not.toContain("visualLensIndex * inlineSign");
    expect(publicCss).toContain("inset-inline-end: -0.52rem");

    expect(fixedCss).toMatch(/v3-liquid-tabbar__material[\s\S]*display: flex;/);
    expect(fixedCss).not.toMatch(/v3-liquid-tabbar__material[\s\S]*direction: ltr;/);
    expect(fixedCss).not.toContain("flex-direction: row-reverse");
    expect(fixedCss).toMatch(/v3-liquid-tabbar__lens[\s\S]*left: 6px !important;/);
    expect(fixedCss).toMatch(/v3-liquid-tabbar__lens[\s\S]*right: auto !important;/);
    expect(fixedCss).toMatch(/v3-liquid-tabbar__item[\s\S]*flex: 1 1 0;/);
    expect(fixedCss).not.toContain("grid-column:");

    expect(organizerTabs).toContain("const physicalLensIndex =");
    expect(organizerTabs).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualActiveIndex : visualActiveIndex',
    );
    expect(organizerTabs).toContain('left: ".375rem"');
    expect(organizerTabs).toContain('right: "auto"');
    expect(organizerTabs).toContain('direction: "ltr"');
    expect(organizerTabs).toContain("${physicalLensIndex} * (100% + .15rem)");
    expect(organizerTabs).not.toContain("visualActiveIndex * inlineSign");
    expect(organizerTabs).toContain(
      'layoutDirection === "rtl" ? "-left-3" : "-right-3"',
    );
    expect(organizerCss).toMatch(/data-v6-organizer-tabbar\] > div[\s\S]*display: flex !important;/);
    expect(organizerCss).not.toMatch(/data-v6-organizer-tabbar\] > div[\s\S]*direction: ltr;/);
    expect(organizerCss).not.toContain("flex-direction: row-reverse");
    expect(organizerCss).toMatch(/data-organizer-tab-index[\s\S]*flex: 1 1 0;/);
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
