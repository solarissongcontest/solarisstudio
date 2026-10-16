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

  it("preserves logical Public direction while isolating the lens in normal LTR overlay flow", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");
    const fixedCss = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(tabbar).toContain("const physicalLensIndex =");
    expect(tabbar).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualLensIndex : visualLensIndex',
    );
    expect(tabbar).toContain('direction: "ltr"');
    expect(tabbar).toContain("${physicalLensIndex} * (100% + 2px)");
    expect(tabbar).not.toContain("visualLensIndex * inlineSign");

    expect(fixedCss).toMatch(/\.v3-liquid-tabbar__material\s*\{[^}]*display: flex;[^}]*\}/);
    expect(fixedCss).not.toMatch(/\.v3-liquid-tabbar__material\s*\{[^}]*direction:\s*ltr;/);
    expect(fixedCss).not.toContain("flex-direction: row-reverse");
    expect(fixedCss).toMatch(
      /\.v3-liquid-tabbar__lens-layer\s*\{[^}]*position: absolute;[^}]*left: 0;[^}]*direction: ltr;[^}]*\}/,
    );
    expect(fixedCss).toMatch(
      /\.v3-liquid-tabbar__lens\s*\{[^}]*position: relative !important;[^}]*display: block;[^}]*left: 6px !important;[^}]*right: auto !important;[^}]*bottom: auto !important;[^}]*height: calc\(100% - 12px\);[^}]*\}/,
    );
    expect(fixedCss).not.toContain("grid-column:");
    expect(fixedCss).toMatch(/v3-liquid-tabbar__item[\s\S]*flex: 1 1 0;/);
  });

  it("keeps Organizer on the same inherited-logical / normal-flow physical-lens model", () => {
    const tabbar = source("src/components/admin/OrganizerV6TabBar.tsx");
    const organizerCss = source("src/styles/v3-organizer-navigation.css");

    expect(tabbar).toContain("const physicalLensIndex =");
    expect(tabbar).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualActiveIndex : visualActiveIndex',
    );
    expect(tabbar).toContain('left: ".375rem"');
    expect(tabbar).toContain('right: "auto"');
    expect(tabbar).toContain('direction: "ltr"');
    expect(tabbar).toContain("${physicalLensIndex} * (100% + .15rem)");
    expect(tabbar).not.toContain("visualActiveIndex * inlineSign");

    expect(organizerCss).toMatch(/\.admin-mobile-nav\[data-v6-organizer-tabbar\] > div\s*\{[^}]*display: flex !important;[^}]*\}/);
    expect(organizerCss).not.toMatch(/\.admin-mobile-nav\[data-v6-organizer-tabbar\] > div\s*\{[^}]*direction:\s*ltr;/);
    expect(organizerCss).not.toContain("flex-direction: row-reverse");
    expect(organizerCss).toMatch(
      /\.v6-organizer-tabbar__lens-layer\s*\{[^}]*position: absolute;[^}]*left: 0;[^}]*direction: ltr;[^}]*\}/,
    );
    expect(organizerCss).toMatch(
      /\.v6-organizer-tabbar__lens\s*\{[^}]*position: relative !important;[^}]*display: block;[^}]*left: \.375rem !important;[^}]*right: auto !important;[^}]*\}/,
    );
    expect(organizerCss).toMatch(/data-organizer-tab-index[\s\S]*flex: 1 1 0;/);
  });
});
