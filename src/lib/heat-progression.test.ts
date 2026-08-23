import { describe, expect, it } from "vitest";

import { heatProgressionOutcome, heatQualifierCutoff } from "./heat-progression";

function show(qualifierCount: number | null, votingQualifiers?: number | string | null) {
  return {
    qualifier_count: qualifierCount,
    voting_config: votingQualifiers == null ? {} : { qualifiers: votingQualifiers },
  } as any;
}

describe("heat progression", () => {
  it("uses the voting-system qualifier count before the legacy column", () => {
    expect(heatQualifierCutoff(show(4, 2))).toBe(2);
    expect(heatQualifierCutoff(show(4, "3"))).toBe(3);
  });

  it("falls back to qualifier_count", () => {
    expect(heatQualifierCutoff(show(2))).toBe(2);
  });

  it("routes ranks inside the cutoff to the semi-final", () => {
    const heat = show(2);
    expect(heatProgressionOutcome(heat, 1)).toBe("qualifier");
    expect(heatProgressionOutcome(heat, 2)).toBe("qualifier");
  });

  it("routes ranks below the cutoff to Second Chance as NQs", () => {
    const heat = show(2);
    expect(heatProgressionOutcome(heat, 3)).toBe("nq");
    expect(heatProgressionOutcome(heat, 10)).toBe("nq");
  });

  it("never guesses when a heat has no cutoff or result rank", () => {
    expect(heatProgressionOutcome(show(null), 1)).toBeNull();
    expect(heatProgressionOutcome(show(2), null)).toBeNull();
    expect(heatProgressionOutcome(show(2), 0)).toBeNull();
  });
});
