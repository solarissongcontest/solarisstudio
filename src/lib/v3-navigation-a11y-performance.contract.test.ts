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
