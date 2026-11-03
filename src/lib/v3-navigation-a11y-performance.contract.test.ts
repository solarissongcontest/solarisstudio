import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation accessibility and performance release contracts", () => {
  it("preserves navigation semantics under Reduced Motion and Reduced Transparency", () => {
    const css = source("src/styles/v3-liquid-tabbar.css");
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toMatch(/prefers-reduced-transparency[\s\S]*backdrop-filter: none/);
    expect(css).toMatch(
      /prefers-reduced-transparency[\s\S]*v3-liquid-tabbar__backdrop[\s\S]*display: none/,
    );
    expect(publicTabs).toContain("prefersReducedMotion()");
    expect(organizerTabs).toContain("prefersReducedMotion()");
    expect(pageSwipe).toContain("prefersReducedMotion()");
  });

  it("keeps icon-only navigation geometry independent of root text scaling", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const fixedCss = source("src/styles/v3-navigation-fixed-geometry.css");
    const materialImport = tabs.indexOf('import "@/styles/v3-liquid-tabbar.css"');
    const fixedImport = tabs.indexOf('import "@/styles/v3-navigation-fixed-geometry.css"');
    const indicatorStart = tabs.indexOf("const indicatorStyle =");
    const indicatorEnd = tabs.indexOf("return (", indicatorStart);
    const indicator = tabs.slice(indicatorStart, indicatorEnd);

    expect(materialImport).toBeGreaterThan(-1);
    expect(fixedImport).toBeGreaterThan(materialImport);
    expect(indicator).toContain("12px");
    expect(indicator).toContain("2px");
    expect(indicator).not.toContain(".76rem");
    expect(indicator).not.toContain(".14rem");
    expect(fixedCss).toContain("width: min(calc(100% - 22px), 544px)");
    expect(fixedCss).toContain("height: 70px");
    expect(fixedCss).toContain("min-height: 44px");
  });

  it("normalizes direct tab drag in RTL without dispatching preview state on every pointer pixel", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("layoutDirection: V3LayoutDirection");
      expect(tabs).toContain("Math.min(firstDelta, lastDelta)");
      expect(tabs).toContain("Math.max(firstDelta, lastDelta)");
      expect(tabs).toContain("resolveV3LogicalHorizontalDelta(rawDelta, drag.layoutDirection)");
      expect(tabs).toContain("data-layout-direction={layoutDirection}");
    }

    expect(publicTabs).toContain("if (nextPreview !== drag.previewIndex)");
    expect(publicTabs).toContain("drag.previewIndex = nextPreview");
    expect(organizerTabs).toContain("if (previewIndex !== drag.previewIndex)");
    expect(organizerTabs).toContain("drag.previewIndex = previewIndex");
  });

  it("degrades optical richness before navigation correctness on slow-update displays", () => {
    const swipeCss = source("src/styles/v3-top-level-swipe.css");
    const performanceCss = source("src/styles/v3-navigation-performance.css");

    expect(swipeCss).toContain('@import "./v3-navigation-performance.css"');
    expect(performanceCss).toContain("@media (update: slow)");
    expect(performanceCss).toMatch(
      /update: slow[\s\S]*v3-liquid-tabbar__backdrop[\s\S]*display: none/,
    );
    expect(performanceCss).toMatch(/update: slow[\s\S]*blur\(16px\)/);

    // Tier B may remove decorative cost, never the semantic tabs, gesture
    // surface or pointer delivery needed to operate the navigation.
    expect(performanceCss).not.toContain("v3-liquid-tabbar__item");
    expect(performanceCss).not.toContain("v3-top-level-swipe-surface");
    expect(performanceCss).not.toContain("pointer-events: none");
  });

  it("keeps the page-swipe pointer hot path compositor-only", () => {
    const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const pointerMoveStart = pageSwipe.indexOf("const onPointerMove =");
    const finishStart = pageSwipe.indexOf("const finish =", pointerMoveStart);

    expect(pointerMoveStart).toBeGreaterThanOrEqual(0);
    expect(finishStart).toBeGreaterThan(pointerMoveStart);

    const hotLoop = pageSwipe.slice(pointerMoveStart, finishStart);
    expect(hotLoop).not.toContain("getBoundingClientRect");
    expect(hotLoop).not.toContain("querySelector");
    expect(hotLoop).toContain("publishVisualProgress(progress, drag, \"drag\")");
  });
});
