import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isV3ScrollableHorizontalOverflow } from "@/lib/v3-navigation-gesture";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 nested horizontal gesture ownership", () => {
  it("recognizes real horizontal overflow without requiring feature annotations", () => {
    expect(
      isV3ScrollableHorizontalOverflow({
        overflowX: "auto",
        scrollWidth: 720,
        clientWidth: 360,
      }),
    ).toBe(true);
    expect(
      isV3ScrollableHorizontalOverflow({
        overflowX: "scroll",
        scrollWidth: 361.5,
        clientWidth: 360,
      }),
    ).toBe(true);
    expect(
      isV3ScrollableHorizontalOverflow({
        overflowX: "hidden",
        scrollWidth: 720,
        clientWidth: 360,
      }),
    ).toBe(false);
    expect(
      isV3ScrollableHorizontalOverflow({
        overflowX: "auto",
        scrollWidth: 360.5,
        clientWidth: 360,
      }),
    ).toBe(false);
  });

  it("keeps explicit content-owner escape hatches and ancestor inspection", () => {
    const gestures = source("src/lib/v3-navigation-gesture.ts");
    expect(gestures).toContain('[data-v3-swipe-owner="content"]');
    expect(gestures).toContain('[data-v3-horizontal-gesture="true"]');
    expect(gestures).toContain("target.closest(HORIZONTAL_BLOCK_SELECTOR)");
    expect(gestures).toContain("let current: Element | null = target");
    expect(gestures).toContain("window.getComputedStyle(current)");
    expect(gestures).toContain("current = current.parentElement");
  });

  it("keeps overflow inspection out of the pointer-move hot loop", () => {
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
