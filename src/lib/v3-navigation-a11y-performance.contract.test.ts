import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  V3_NAVIGATION_GEOMETRY,
  V3_NAVIGATION_REFERENCE_STATUS,
} from "@/lib/v3-navigation-geometry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation accessibility and performance release contracts", () => {
  it("publishes the canonical implementation geometry vocabulary without faking N0 approval", () => {
    expect(Object.keys(V3_NAVIGATION_GEOMETRY)).toEqual(
      expect.arrayContaining([
        "shellMaxWidth",
        "shellHeightExpanded",
        "shellHeightCompact",
        "horizontalInset",
        "bottomInset",
        "shellRadius",
        "iconOpticalSize",
        "lensRadius",
        "compactWidth",
        "obstructionMax",
        "minimumTarget",
      ]),
    );
    expect(V3_NAVIGATION_GEOMETRY.minimumTarget).toBeGreaterThanOrEqual(44);
    expect(V3_NAVIGATION_GEOMETRY.shellHeightCompact).toBeLessThan(
      V3_NAVIGATION_GEOMETRY.shellHeightExpanded,
    );
    expect(V3_NAVIGATION_REFERENCE_STATUS.status).toBe(
      "awaiting-approved-instagram-baseline",
    );
    expect(V3_NAVIGATION_REFERENCE_STATUS.referenceValues).toBeNull();
  });

  it("preserves interaction semantics under Reduced Motion and Reduced Transparency", () => {
    const css = source("src/styles/v3-liquid-tabbar.css");
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toMatch(/prefers-reduced-transparency[\s\S]*backdrop-filter: none/);
    expect(css).toMatch(/prefers-reduced-transparency[\s\S]*v3-liquid-tabbar__backdrop[\s\S]*display: none/);
    expect(publicTabs).toContain("prefersReducedMotion()");
    expect(organizerTabs).toContain("prefersReducedMotion()");
    expect(pageSwipe).toContain("prefersReducedMotion()");
  });

  it("degrades optical richness before navigation correctness", () => {
    const swipeCss = source("src/styles/v3-top-level-swipe.css");
    const performanceCss = source("src/styles/v3-navigation-performance.css");

    expect(swipeCss).toContain('@import "./v3-navigation-performance.css"');
    expect(performanceCss).toContain("@media (update: slow)");
    expect(performanceCss).toMatch(/update: slow[\s\S]*v3-liquid-tabbar__backdrop[\s\S]*display: none/);
    expect(performanceCss).toMatch(/update: slow[\s\S]*blur\(16px\)/);
    expect(performanceCss).not.toContain("pointer-events: none");
    expect(performanceCss).not.toContain("display: none;\n  }\n\n  [data-solaris-v3] .v3-liquid-tabbar__material");
  expect(performanceCss).not.toContain("v3-liquid-tabbar__item");
  expect(performanceCss).not.toContain("v3-top-level-swipe-surface");
  });

  it("keeps hot gesture loops free of repeated layout reads and per-pixel semantic state churn", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      const moveStart = tabs.indexOf("const moveDrag =");
      const finishStart = tabs.indexOf("const finishDrag =", moveStart);
      const hotLoop = tabs.slice(moveStart, finishStart);
      expect(hotLoop).not.toContain("getBoundingClientRect");
      expect(hotLoop).not.toContain("tabRects()");
      expect(hotLoop).toContain("previewIndex");
    }

    const pointerMoveStart = pageSwipe.indexOf("const onPointerMove =");
    const finishStart = pageSwipe.indexOf("const finish =", pointerMoveStart);
    const pageHotLoop = pageSwipe.slice(pointerMoveStart, finishStart);
    expect(pageHotLoop).not.toContain("getBoundingClientRect");
    expect(pageHotLoop).not.toContain("querySelector");
  });
});
