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

  it("keeps closed opportunities distinct from completed responsibilities", () => {
    expect(screen).toContain('title="Closed"');
    expect(screen).toContain('data-v3-participate-closed=""');
    expect(screen).toContain("View closed opportunities");
    expect(screen).toContain("Closed does not mean completed.");
    expect(screen).toContain('title="Completed"');
  });

  it("labels closed voting context without presenting it as current voting work", () => {
    expect(screen).toContain('if (action.sourceState === "finished") return "Closed"');
    expect(screen).toContain('if (action.sourceState === "problem") return "Closed · unresolved"');
    expect(screen).toContain('if (action.sourceState === "needs_attention") return "Open · action required"');
  });
});
