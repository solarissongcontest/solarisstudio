import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  holdMovementExceeded,
  shouldCancelPendingHoldOnMove,
  SOLARIS_HOLD_MOVEMENT_TOLERANCE,
} from "@/lib/use-solaris-press-hold";

describe("Solaris V6 press-hold physics", () => {
  it("ignores sub-threshold finger noise", () => {
    expect(holdMovementExceeded(0, 0, 3, 4)).toBe(false);
  });

  it("cancels hold intent once movement becomes a drag", () => {
    expect(
      holdMovementExceeded(
        0,
        0,
        SOLARIS_HOLD_MOVEMENT_TOLERANCE + 1,
        0,
      ),
    ).toBe(true);
  });

  it("cancels an ordinary pre-hold swipe instead of opening another tab", () => {
    expect(shouldCancelPendingHoldOnMove(false, 0, 0, 12, 0)).toBe(true);
    expect(shouldCancelPendingHoldOnMove(false, 0, 0, 3, 4)).toBe(false);
  });

  it("keeps an engaged hold active during a direct lens drag", () => {
    expect(shouldCancelPendingHoldOnMove(true, 0, 0, 100, 0)).toBe(false);
    expect(shouldCancelPendingHoldOnMove(true, 0, 0, 0, 150)).toBe(false);
  });

  it("marks an engaged pointer before publishing the held state", () => {
    const source = readFileSync("src/lib/use-solaris-press-hold.ts", "utf8");
    expect(source).toMatch(/active\.engaged = true;\s*setHeld\(true\);/);
    expect(source).toContain("active.pointerId === pointerId && active.engaged");
  });

  it("tears down a pending hold without enqueueing React state", () => {
    const source = readFileSync("src/lib/use-solaris-press-hold.ts", "utf8");
    expect(source).toContain("window.clearTimeout(active.timer)");
    expect(source).toContain("session.current = null");
    expect(source).not.toContain("useEffect(() => () => end(), [end])");
  });
});
