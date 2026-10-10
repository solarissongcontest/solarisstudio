import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  holdMovementExceeded,
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

  it("tears down a pending hold without enqueueing React state", () => {
    const source = readFileSync("src/lib/use-solaris-press-hold.ts", "utf8");
    expect(source).toContain("window.clearTimeout(active.timer)");
    expect(source).toContain("session.current = null");
    expect(source).not.toContain("useEffect(() => () => end(), [end])");
  });
});
