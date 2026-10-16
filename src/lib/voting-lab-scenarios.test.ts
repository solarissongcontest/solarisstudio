import { describe, expect, it } from "vitest";

import { buildSyntheticVotingLabBallots } from "./voting-lab-scenarios";

const entries = ["a", "b", "c", "d", "e", "f", "g"];

describe("Voting Lab synthetic scenarios", () => {
  it("requires at least five distinct entries", () => {
    expect(buildSyntheticVotingLabBallots(["a", "b", "c", "d"], "balanced", 12)).toEqual([]);
    expect(buildSyntheticVotingLabBallots(["a", "a", "b", "c", "d", "e"], "balanced", 1)).toHaveLength(1);
  });

  it("builds deterministic baseline-valid balanced ballots", () => {
    const first = buildSyntheticVotingLabBallots(entries, "balanced", 8);
    const second = buildSyntheticVotingLabBallots(entries, "balanced", 8);
    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    for (const ballot of first) {
      expect(ballot.id).toMatch(/^synthetic-balanced-/);
      expect(ballot.voterId).toMatch(/^synthetic-voter-/);
      expect(ballot.awards).toHaveLength(5);
      expect(ballot.awards.reduce((sum, award) => sum + award.points, 0)).toBe(20);
      expect(Math.max(...ballot.awards.map((award) => award.points))).toBeLessThanOrEqual(10);
    }
  });

  it("keeps every scenario synthetic and bounded", () => {
    for (const scenario of ["balanced", "concentrated", "polarized"] as const) {
      const ballots = buildSyntheticVotingLabBallots(entries, scenario, 500);
      expect(ballots).toHaveLength(200);
      expect(new Set(ballots.map((ballot) => ballot.id)).size).toBe(200);
      expect(ballots.every((ballot) => ballot.awards.length === 5)).toBe(true);
    }
  });
});
