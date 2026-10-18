import { describe, expect, it } from "vitest";

import {
  resolveV3NavigationVisualProgress,
  resolveV3TabIconVisualState,
} from "@/lib/v3-navigation-visual-progress";

describe("V3 navigation visual progress", () => {
  it("normalizes physical direct-lens movement onto one logical axis", () => {
    expect(
      resolveV3NavigationVisualProgress({
        originIndex: 2,
        physicalDelta: 40,
        slotWidth: 80,
        itemCount: 5,
        direction: "ltr",
      }),
    ).toBeCloseTo(2.5);
    expect(
      resolveV3NavigationVisualProgress({
        originIndex: 2,
        physicalDelta: 40,
        slotWidth: 80,
        itemCount: 5,
        direction: "rtl",
      }),
    ).toBeCloseTo(1.5);
  });

  it("clamps visual progress at the real Home and Me boundaries", () => {
    expect(
      resolveV3NavigationVisualProgress({
        originIndex: 0,
        physicalDelta: -400,
        slotWidth: 80,
        itemCount: 5,
        direction: "ltr",
      }),
    ).toBe(0);
    expect(
      resolveV3NavigationVisualProgress({
        originIndex: 4,
        physicalDelta: 400,
        slotWidth: 80,
        itemCount: 5,
        direction: "ltr",
      }),
    ).toBe(4);
  });

  it("reproduces resting icon optics at integer progress", () => {
    expect(resolveV3TabIconVisualState(2, 2)).toEqual({
      weight: 1,
      opacity: 1,
      scale: 1.02,
      strokeWidth: 2.25,
    });
    expect(resolveV3TabIconVisualState(1, 2)).toEqual({
      weight: 0,
      opacity: 0.78,
      scale: 0.97,
      strokeWidth: 1.9,
    });
  });

  it("hands emphasis continuously between adjacent icons", () => {
    const leading = resolveV3TabIconVisualState(1, 1.25);
    const trailing = resolveV3TabIconVisualState(2, 1.25);

    expect(leading.weight).toBeCloseTo(0.75);
    expect(trailing.weight).toBeCloseTo(0.25);
    expect(leading.opacity).toBeGreaterThan(trailing.opacity);
    expect(leading.scale).toBeGreaterThan(trailing.scale);
    expect(leading.strokeWidth).toBeGreaterThan(trailing.strokeWidth);
  });
});
