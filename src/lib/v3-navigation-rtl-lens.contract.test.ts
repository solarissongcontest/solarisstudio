import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 Public navigation RTL and physical-lens contract", () => {
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

  it("keeps the Public lens in a physical LTR overlay while route semantics inherit RTL", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const css = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(tabs).toContain("const physicalLensIndex =");
    expect(tabs).toContain(
      'layoutDirection === "rtl" ? count - 1 - visualLensIndex : visualLensIndex',
    );
    expect(tabs).toContain('direction: "ltr"');
    expect(tabs).toContain("${physicalLensIndex} * (100% + 2px)");
    expect(tabs).not.toContain("visualLensIndex * inlineSign");

    expect(css).toMatch(/\.v3-liquid-tabbar__material\s*\{[^}]*display: flex;[^}]*\}/);
    expect(css).not.toMatch(/\.v3-liquid-tabbar__material\s*\{[^}]*direction:\s*ltr;/);
    expect(css).not.toContain("flex-direction: row-reverse");
    expect(css).toMatch(
      /\.v3-liquid-tabbar__lens-layer\s*\{[^}]*position: absolute;[^}]*left: 0;[^}]*direction: ltr;[^}]*\}/,
    );
    expect(css).toMatch(
      /\.v3-liquid-tabbar__lens\s*\{[^}]*position: absolute !important;[^}]*display: block;[^}]*left: 6px !important;[^}]*right: auto !important;[^}]*top: 6px !important;[^}]*bottom: 6px !important;[^}]*height: auto !important;[^}]*\}/,
    );
    expect(css).not.toContain("grid-column:");
    expect(css).toMatch(/v3-liquid-tabbar__item[\s\S]*flex: 1 1 0;/);
  });

  it("normalizes direct drag logically without dispatching React preview state every pointer pixel", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabs).toContain("layoutDirection: V3LayoutDirection");
    expect(tabs).toContain("Math.min(firstDelta, lastDelta)");
    expect(tabs).toContain("Math.max(firstDelta, lastDelta)");
    expect(tabs).toContain("resolveV3LogicalHorizontalDelta(rawDelta, drag.layoutDirection)");
    expect(tabs).toContain("if (nextPreview !== drag.previewIndex)");
    expect(tabs).toContain("drag.previewIndex = nextPreview");
    expect(tabs).toContain("data-layout-direction={layoutDirection}");
  });
});
