import { describe, expect, it } from "vitest";

import { backtestRound, buildCoordinatedAttackBallots } from "@/integrations/televoting/backtest-math";
import type { RobustBallotInput } from "@/integrations/televoting/robust-televote-math";

function fixture(voters: number): { participants: string[]; ballots: RobustBallotInput[] } {
  const participants = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const ballots = Array.from({ length: voters }, (_, index): RobustBallotInput => {
    const rotation = index % participants.length;
    const order = [...participants.slice(rotation), ...participants.slice(0, rotation)];
    return {
      voterId: `voter-${index + 1}`,
      allocations: {
        [order[0]!]: 7,
        [order[1]!]: 5,
        [order[2]!]: 4,
        [order[3]!]: 2,
        [order[4]!]: 2,
      },
    };
  });
  return { participants, ballots };
}

describe("televote backtesting", () => {
  for (const voters of [18, 20, 25]) {
    it(`produces deterministic exact-pool comparisons with ${voters} voters`, () => {
      const { participants, ballots } = fixture(voters);
      const first = backtestRound({ participants, ballots, totalPoints: 580 });
      const second = backtestRound({ participants, ballots, totalPoints: 580 });

      expect(first).toEqual(second);
      expect(first.legacy.winnerPoints).toBeGreaterThanOrEqual(0);
      expect(first.robust.winnerPoints).toBeGreaterThanOrEqual(0);
      expect(first.attacks).toHaveLength(3);
      expect(first.attacks.map((row) => row.attackers)).toEqual([1, 2, 3]);
    });
  }

  it("builds legal 20-point coordinated attack ballots with five supported entries", () => {
    const participants = ["A", "B", "C", "D", "E", "F"];
    const ballots = buildCoordinatedAttackBallots({ participants, target: "F", attackers: 3 });
    expect(ballots).toHaveLength(3);
    for (const ballot of ballots) {
      const values = Object.values(ballot.allocations);
      expect(values.reduce((sum, value) => sum + value, 0)).toBe(20);
      expect(values).toHaveLength(5);
      expect(Math.max(...values)).toBe(10);
      expect(ballot.allocations.F).toBe(10);
    }
  });

  it("reports attack movement independently for legacy and robust engines", () => {
    const { participants, ballots } = fixture(20);
    const result = backtestRound({
      participants,
      ballots,
      totalPoints: 580,
      attackTarget: "H",
    });

    for (const attack of result.attacks) {
      expect(attack.target).toBe("H");
      expect(Number.isFinite(attack.legacyPointGain)).toBe(true);
      expect(Number.isFinite(attack.robustPointGain)).toBe(true);
      expect(attack.legacyRankAfter).toBeGreaterThanOrEqual(1);
      expect(attack.robustRankAfter).toBeGreaterThanOrEqual(1);
    }
  });
});
