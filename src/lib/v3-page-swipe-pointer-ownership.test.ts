import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  resolveV3SwipePointerStart,
  v3SwipeTouchStillSingle,
} from "@/lib/v3-page-swipe-pointer-ownership";

const swipeSurface = readFileSync(
  "src/components/v3/V3TopLevelSwipeSurface.tsx",
  "utf8",
);

describe("V3 whole-page swipe primary pointer ownership", () => {
  it("starts only for a primary pointer when the surface is idle", () => {
    expect(
      resolveV3SwipePointerStart({
        activePointerId: null,
        incomingPointerId: 7,
        isPrimary: true,
        pointerType: "touch",
      }),
    ).toBe("start");
    expect(
      resolveV3SwipePointerStart({
        activePointerId: null,
        incomingPointerId: 8,
        isPrimary: false,
        pointerType: "touch",
      }),
    ).toBe("ignore");
  });

  it("cancels an owned gesture when a second touch reaches the surface", () => {
    expect(
      resolveV3SwipePointerStart({
        activePointerId: 7,
        incomingPointerId: 8,
        isPrimary: false,
        pointerType: "touch",
      }),
    ).toBe("cancel");
    expect(
      resolveV3SwipePointerStart({
        activePointerId: 7,
        incomingPointerId: 9,
        isPrimary: true,
        pointerType: "touch",
      }),
    ).toBe("cancel");
  });

  it("does not let mouse or pen input overwrite an active touch", () => {
    for (const pointerType of ["mouse", "pen"]) {
      expect(
        resolveV3SwipePointerStart({
          activePointerId: 7,
          incomingPointerId: 8,
          isPrimary: true,
          pointerType,
        }),
      ).toBe("ignore");
    }
  });

  it("does not reset an existing pointer on a duplicate start event", () => {
    expect(
      resolveV3SwipePointerStart({
        activePointerId: 7,
        incomingPointerId: 7,
        isPrimary: true,
        pointerType: "touch",
      }),
    ).toBe("ignore");
  });

  it("invalidates multi-touch changes, not just two-finger pointerdown", () => {
    expect(v3SwipeTouchStillSingle(1)).toBe(true);
    expect(v3SwipeTouchStillSingle(0)).toBe(false);
    expect(v3SwipeTouchStillSingle(2)).toBe(false);
    expect(v3SwipeTouchStillSingle(3)).toBe(false);
  });

  it("wires the decision into the live compositor and cancels before commit", () => {
    const down = swipeSurface.split("const onPointerDown =")[1]?.split("const onPointerMove =")[0] ?? "";
    expect(down).toContain("resolveV3SwipePointerStart({");
    expect(down).toContain("activePointerId: dragRef.current?.pointerId ?? null");
    expect(down).toContain("incomingPointerId: event.pointerId");
    expect(down).toContain("isPrimary: event.isPrimary");
    expect(down).toContain('if (pointerDecision === "cancel")');
    expect(down).toContain("resetSurface()");
    expect(down).toContain('pointerDecision !== "start"');
    expect(down).not.toContain("onCommit(");
  });

  it("aborts multi-touch native motion even when the secondary contact began elsewhere", () => {
    const handler = swipeSurface.split("const preventOwnedHorizontalTouchPan =")[1]?.split("surface.addEventListener")[0] ?? "";
    expect(handler).toContain("v3SwipeTouchStillSingle(event.touches.length)");
    expect(handler).toContain("resetSurface()");
    expect(handler.indexOf("resetSurface()")).toBeLessThan(handler.indexOf("event.preventDefault()"));
    expect(swipeSurface).toContain("}, [resetSurface]);");
  });

  it("retains existing abort behavior for pointer-cancel and lost capture", () => {
    expect(swipeSurface).toContain("onPointerCancel={(event) => finish(event, true)}");
    expect(swipeSurface).toContain("onLostPointerCapture={(event) => {");
    expect(swipeSurface).toContain("finish(event, true)");
  });
});
