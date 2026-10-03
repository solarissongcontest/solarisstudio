import { describe, expect, it } from "vitest";

import {
  interactionDuration,
  resolveElasticDrag,
  resolveGestureOwner,
  resolveScrollResponsiveBar,
  SOLARIS_INTERACTION_TOKENS,
} from "@/lib/interaction-physics";

describe("Solaris Interaction Physics", () => {
  it("keeps tiny scroll noise from toggling navigation", () => {
    const down = resolveScrollResponsiveBar({
      collapsed: false,
      currentY: 203,
      lastY: 200,
      downTravel: 2,
      upTravel: 0,
    });
    expect(down.collapsed).toBe(false);
    expect(down.downTravel).toBe(5);

    const reverse = resolveScrollResponsiveBar({
      ...down,
      currentY: 202,
      lastY: 203,
    });
    expect(reverse.collapsed).toBe(false);
    expect(reverse.upTravel).toBe(1);
  });

  it("collapses after intentional down travel and expands after intentional reverse travel", () => {
    const collapsed = resolveScrollResponsiveBar({
      collapsed: false,
      currentY: 220,
      lastY: 170,
      downTravel: 10,
      upTravel: 0,
    });
    expect(collapsed.collapsed).toBe(true);
    expect(collapsed.downTravel).toBe(0);

    const expanded = resolveScrollResponsiveBar({
      collapsed: true,
      currentY: 190,
      lastY: 210,
      downTravel: 0,
      upTravel: 0,
    });
    expect(expanded.collapsed).toBe(false);
  });

  it("forces navigation expanded near the top", () => {
    expect(
      resolveScrollResponsiveBar({
        collapsed: true,
        currentY: 40,
        lastY: 120,
        downTravel: 99,
        upTravel: 0,
      }),
    ).toEqual({ collapsed: false, downTravel: 0, upTravel: 0 });
  });

  it("bounds elastic drag and keeps deformation within the V6 contract", () => {
    const response = resolveElasticDrag({
      rawDelta: 400,
      minDelta: -100,
      maxDelta: 120,
      slotWidth: 70,
    });

    expect(response.delta).toBe(120);
    expect(response.progress).toBe(1);
    expect(response.scaleX).toBe(1 + SOLARIS_INTERACTION_TOKENS.stretch.standard);
    expect(response.growWidth).toBe(10);
    expect(response.growHeight).toBe(9);
    expect(response.growRadius).toBe(4);
    expect(response.direction).toBe("right");
  });

  it("arbitrates gestures only after directional intent is meaningful", () => {
    expect(resolveGestureOwner(3, 2)).toBe("none");
    expect(resolveGestureOwner(20, 5)).toBe("horizontal");
    expect(resolveGestureOwner(5, 20)).toBe("vertical");
    expect(resolveGestureOwner(10, 10)).toBe("none");
  });

  it("reduces motion without removing state feedback timing entirely", () => {
    expect(interactionDuration("heavy", false)).toBe(
      SOLARIS_INTERACTION_TOKENS.duration.deliberate,
    );
    expect(interactionDuration("heavy", true)).toBe(
      SOLARIS_INTERACTION_TOKENS.duration.instant,
    );
  });
});
