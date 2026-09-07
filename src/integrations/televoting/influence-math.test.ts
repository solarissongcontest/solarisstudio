import { describe, expect, it } from "vitest";

import { analyseRobustInfluence } from "@/integrations/televoting/influence-math";

describe("robust televote influence analysis", () => {
  const participants = ["A", "B", "C", "D", "E"];
  const ballots = [
    { voterId: "1", allocations: { A: 10, B: 4, C: 3, D: 2, E: 1 } },
    { voterId: "2", allocations: { A: 10, B: 4, C: 3, D: 2, E: 1 } },
    { voterId: "3", allocations: { A: 10, B: 4, C: 3, D: 2, E: 1 } },
    { voterId: "4", allocations: { B: 10, A: 4, C: 3, D: 2, E: 1 } },
    { voterId: "5", allocations: { B: 10, A: 4, C: 3, D: 2, E: 1 } },
  ];

  it("recalculates the full result once per voter", () => {
    const result = analyseRobustInfluence({ participants, ballots, totalPoints: 290, qualifierCount: 3 });
    expect(result.voters).toHaveLength(ballots.length);
    expect(result.baseline.distributedTotal).toBe(290);
    for (const row of result.voters) {
      expect(row.maxRankMovement).toBeGreaterThanOrEqual(0);
      expect(row.maxPointMovement).toBeGreaterThanOrEqual(0);
    }
  });

  it("supports leave-cluster-out counterfactuals", () => {
    const result = analyseRobustInfluence({
      participants,
      ballots,
      totalPoints: 290,
      qualifierCount: 3,
      clusters: [{ id: "possible-pact", members: ["1", "2", "3"] }],
    });

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.clusterId).toBe("possible-pact");
    expect(result.clusters[0]!.members).toEqual(["1", "2", "3"]);
    expect(result.clusters[0]!.maxPointMovement).toBeGreaterThan(0);
  });
});
