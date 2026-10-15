import { describe, expect, it } from "vitest";

import {
  classifyV3SwipeIntent,
  isV3BrowserEdgeGestureStart,
  resolveV3PageSwipeOffset,
  resolveV3PageSwipeTarget,
  resolveV3TopLevelSwipePolicy,
} from "@/lib/v3-navigation-gesture";

describe("V3 top-level navigation gesture policy", () => {
  it("enables root pages and fails closed for focused or complex routes", () => {
    expect(resolveV3TopLevelSwipePolicy("/")).toBe("enabled");
    expect(resolveV3TopLevelSwipePolicy("/explore")).toBe("enabled");
    expect(resolveV3TopLevelSwipePolicy("/results")).toBe("enabled");
    expect(resolveV3TopLevelSwipePolicy("/countries/oland")).toBe("content-priority");
    expect(resolveV3TopLevelSwipePolicy("/settings")).toBe("content-priority");
    expect(resolveV3TopLevelSwipePolicy("/jury-voting")).toBe("critical-flow");
    expect(resolveV3TopLevelSwipePolicy("/show-mode")).toBe("disabled");
  });

  it("waits for meaningful directional intent and gives vertical scroll priority", () => {
    expect(classifyV3SwipeIntent({ deltaX: 4, deltaY: 2 })).toBe("undecided");
    expect(classifyV3SwipeIntent({ deltaX: 30, deltaY: 8 })).toBe("horizontal");
    expect(classifyV3SwipeIntent({ deltaX: 8, deltaY: 30 })).toBe("vertical");
    expect(classifyV3SwipeIntent({ deltaX: 12, deltaY: 11 })).toBe("undecided");
  });

  it("reserves both browser edges instead of stealing native history gestures", () => {
    expect(isV3BrowserEdgeGestureStart({ clientX: 12, viewportWidth: 390 })).toBe(true);
    expect(isV3BrowserEdgeGestureStart({ clientX: 378, viewportWidth: 390 })).toBe(true);
    expect(isV3BrowserEdgeGestureStart({ clientX: 120, viewportWidth: 390 })).toBe(false);
  });

  it("rubber-bands the first and last tab instead of revealing fake destinations", () => {
    expect(
      resolveV3PageSwipeOffset({
        rawDelta: 300,
        activeIndex: 0,
        itemCount: 5,
        viewportWidth: 390,
      }),
    ).toBe(56);
    expect(
      resolveV3PageSwipeOffset({
        rawDelta: -300,
        activeIndex: 4,
        itemCount: 5,
        viewportWidth: 390,
      }),
    ).toBe(-56);
  });

  it("lands only on the adjacent destination using distance or velocity", () => {
    expect(
      resolveV3PageSwipeTarget({
        deltaX: -120,
        velocityX: -0.2,
        viewportWidth: 390,
        activeIndex: 1,
        itemCount: 5,
      }),
    ).toBe(2);
    expect(
      resolveV3PageSwipeTarget({
        deltaX: 18,
        velocityX: 0.8,
        viewportWidth: 390,
        activeIndex: 3,
        itemCount: 5,
      }),
    ).toBe(2);
    expect(
      resolveV3PageSwipeTarget({
        deltaX: -340,
        velocityX: -2,
        viewportWidth: 390,
        activeIndex: 2,
        itemCount: 5,
      }),
    ).toBe(3);
  });
});
