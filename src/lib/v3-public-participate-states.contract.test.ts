import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("src/components/v3/V3ParticipateScreen.tsx", "utf8");

describe("V3 Participate state presentation", () => {
  it("renders calm, actionable, blocked, waiting and upcoming focus states", () => {
    for (const state of ["clear", "actionable", "blocked", "waiting", "upcoming"] as const) {
      expect(screen).toContain(`case "${state}"`);
    }
    expect(screen).toContain("You're caught up");
    expect(screen).toContain("No action available");
  });

  it("keeps optional participation visually subordinate", () => {
    expect(screen).toContain('title="Optional participation"');
    expect(screen).toContain("Public voting stays optional even when it is time-sensitive.");
  });
});
