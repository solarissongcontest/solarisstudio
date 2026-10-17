import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 nested horizontal gesture ownership", () => {
  it("keeps explicit feature-owner escape hatches", () => {
    const gestures = source("src/lib/v3-navigation-gesture.ts");

    expect(gestures).toContain('[data-v3-swipe-owner="content"]');
    expect(gestures).toContain('[data-v3-horizontal-gesture="true"]');
    expect(gestures).toContain('[data-carousel]');
    expect(gestures).toContain('[role="slider"]');
    expect(gestures).toContain("target.closest(HORIZONTAL_BLOCK_SELECTOR)");
  });

  it("fails closed around real unannotated horizontal overflow", () => {
    const gestures = source("src/lib/v3-navigation-gesture.ts");

    expect(gestures).toContain("export function isV3ScrollableHorizontalOverflow");
    expect(gestures).toContain('overflow === "auto" || overflow === "scroll"');
    expect(gestures).toContain("scrollWidth > clientWidth + 1");
    expect(gestures).toContain("let current: Element | null = target");
    expect(gestures).toContain("window.getComputedStyle(current)");
    expect(gestures).toContain("current = current.parentElement");
  });

  it("performs overflow inspection only at gesture start, not per pointer-move frame", () => {
    const surface = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const pointerDownStart = surface.indexOf("const onPointerDown =");
    const pointerMoveStart = surface.indexOf("const onPointerMove =", pointerDownStart);
    const finishStart = surface.indexOf("const finish =", pointerMoveStart);
    const pointerDown = surface.slice(pointerDownStart, pointerMoveStart);
    const pointerMove = surface.slice(pointerMoveStart, finishStart);

    expect(pointerDown).toContain("elementBlocksV3TopLevelSwipe(event.target)");
    expect(pointerMove).not.toContain("elementBlocksV3TopLevelSwipe");
    expect(pointerMove).not.toContain("getComputedStyle");
  });
});
