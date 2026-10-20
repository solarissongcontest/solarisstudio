import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation performance degradation", () => {
  it("degrades optical richness on slow-update displays without disabling navigation semantics", () => {
    const swipeCss = source("src/styles/v3-top-level-swipe.css");
    const performanceCss = source("src/styles/v3-navigation-performance.css");

    expect(swipeCss).toContain('@import "./v3-navigation-performance.css"');
    expect(performanceCss).toContain("@media (update: slow)");
    expect(performanceCss).toMatch(/update: slow[\s\S]*v3-liquid-tabbar__backdrop[\s\S]*display: none/);
    expect(performanceCss).toMatch(/update: slow[\s\S]*blur\(16px\)/);

    // Tier B may remove decorative optical work, but it must never disable
    // semantic tab items, the swipe surface, or pointer delivery.
    expect(performanceCss).not.toContain("v3-liquid-tabbar__item");
    expect(performanceCss).not.toContain("v3-top-level-swipe-surface");
    expect(performanceCss).not.toContain("pointer-events: none");
  });

  it("keeps the dormant page-swipe pointer hot path free of layout and DOM-query reads", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const pointerMoveStart = swipe.indexOf("const onPointerMove =");
    const finishStart = swipe.indexOf("const finish =", pointerMoveStart);
    const hotLoop = swipe.slice(pointerMoveStart, finishStart);

    expect(pointerMoveStart).toBeGreaterThan(-1);
    expect(finishStart).toBeGreaterThan(pointerMoveStart);
    expect(hotLoop).not.toContain("getBoundingClientRect");
    expect(hotLoop).not.toContain("querySelector");
    expect(hotLoop).not.toContain("querySelectorAll");
  });
});
