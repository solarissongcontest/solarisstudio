import { describe, expect, it } from "vitest";

import { shouldV3FireSuccessHaptic, v3InteractionPolicy } from "./v3-interaction-policy";

describe("V3 interaction policy", () => {
  it("keeps tap feedback immediate", () => {
    expect(v3InteractionPolicy("tap")).toMatchObject({
      durationMs: 100,
      spring: "tight",
      transform: "press",
    });
  });

  it("uses selection haptic for tab changes", () => {
    expect(v3InteractionPolicy("tab_select")).toMatchObject({
      haptic: "selection",
      spring: "standard",
      interruptible: true,
    });
  });

  it("gives result reveal the expressive budget while keeping it interruptible", () => {
    expect(v3InteractionPolicy("result_reveal")).toMatchObject({
      durationMs: 1200,
      spring: "soft",
      haptic: "success",
      transform: "staged",
      interruptible: true,
    });
  });

  it("removes spatial transforms and springs in reduced-motion mode", () => {
    expect(v3InteractionPolicy("sheet_open", "reduced")).toMatchObject({
      spring: "none",
      transform: "none",
      durationMs: 140,
    });
    expect(v3InteractionPolicy("validation_error", "reduced")).toMatchObject({
      spring: "none",
      transform: "none",
      reducedMotionFallback: "color",
    });
  });

  it("never fires a success haptic before the authoritative operation succeeds", () => {
    expect(shouldV3FireSuccessHaptic(false)).toBe(false);
    expect(shouldV3FireSuccessHaptic(true)).toBe(true);
  });

  it("uses warning rather than success feedback for validation errors", () => {
    expect(v3InteractionPolicy("validation_error").haptic).toBe("warning");
  });

  it("keeps submission success non-interruptible once authoritative success begins", () => {
    expect(v3InteractionPolicy("submission_success")).toMatchObject({
      interruptible: false,
      haptic: "success",
    });
  });
});
