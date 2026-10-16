import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation RTL integration contract", () => {
  it("keeps whole-page progress logical while mirroring physical composition", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(swipe).toContain("type V3LayoutDirection");
    expect(swipe).toContain("layoutDirection: V3LayoutDirection");
    expect(swipe).toContain("layoutDirection: layoutDirectionFor(event.currentTarget)");
    expect(swipe).toContain("direction: drag.layoutDirection");
    expect(swipe).toContain("resolveV3PhysicalInlineSign(state.layoutDirection)");
    expect(swipe).toMatch(
      /const offsetRatio = \(activeIndex - boundedProgress\) \* physicalInlineSign/,
    );
    expect(swipe).toMatch(
      /\(boundedProgress - activeIndex\) \* state\.lensStepWidth \* physicalInlineSign/,
    );
    expect(css).toContain(".v3-top-level-swipe-surface:dir(rtl)");
    expect(css).toMatch(/:dir\(rtl\)[\s\S]*page--previous[\s\S]*translate3d\(100%/);
    expect(css).toMatch(/:dir\(rtl\)[\s\S]*page--next[\s\S]*translate3d\(-100%/);
  });

  it("mirrors the public slot index exactly once on an LTR physical material axis", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");
    const fixedCss = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(tabbar).toContain("const physicalLensIndex =");
    expect(tabbar).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualLensIndex : visualLensIndex',
    );
    expect(tabbar).toContain('direction: "ltr"');
    expect(tabbar).toContain("${physicalLensIndex} * (100% + 2px)");
    expect(tabbar).not.toContain("visualLensIndex * inlineSign");

    expect(fixedCss).toMatch(/v3-liquid-tabbar__material[\s\S]*display: flex;/);
    expect(fixedCss).toMatch(/v3-liquid-tabbar__material[\s\S]*direction: ltr;/);
    expect(fixedCss).toMatch(
      /data-layout-direction="rtl"[\s\S]*\.v3-liquid-tabbar__material[\s\S]*flex-direction: row-reverse;/,
    );
    expect(fixedCss).toMatch(/v3-liquid-tabbar__lens[\s\S]*left: 6px !important;/);
    expect(fixedCss).toMatch(/v3-liquid-tabbar__lens[\s\S]*right: auto !important;/);
    expect(fixedCss).not.toContain("grid-column:");
    expect(fixedCss).toMatch(/v3-liquid-tabbar__item[\s\S]*flex: 1 1 0;/);
    expect(fixedCss).toMatch(
      /data-layout-direction="rtl"[\s\S]*\.v3-liquid-tabbar__item[\s\S]*direction: rtl;/,
    );
  });

  it("keeps the Organizer selected lens on its explicit physical RTL axis", () => {
    const tabbar = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(tabbar).toContain("const physicalLensIndex =");
    expect(tabbar).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualActiveIndex : visualActiveIndex',
    );
    expect(tabbar).toContain('left: ".375rem"');
    expect(tabbar).toContain('right: "auto"');
    expect(tabbar).toContain('direction: "ltr"');
    expect(tabbar).toContain("${physicalLensIndex} * (100% + .15rem)");
    expect(tabbar).not.toContain("visualActiveIndex * inlineSign");
  });
});
