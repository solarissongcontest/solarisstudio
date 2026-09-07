import { describe, expect, it } from "vitest";

import { calculateBallotSimilarityRisk, cosineSimilarity } from "@/integrations/televoting/ballot-similarity";

describe("ballot similarity", () => {
  it("calculates cosine similarity without depending on ballot magnitude", () => {
    expect(cosineSimilarity([10, 5, 0], [20, 10, 0])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([10, 0], [0, 10])).toBeCloseTo(0, 10);
  });

  it("judges similarity relative to normal consensus in the round", () => {
    const participants = ["A", "B", "C", "D", "E"];
    const others = [
      { voterId: "1", allocations: { A: 10, B: 5, C: 3, D: 1, E: 1 } },
      { voterId: "2", allocations: { A: 1, B: 10, C: 5, D: 3, E: 1 } },
      { voterId: "3", allocations: { A: 3, B: 1, C: 10, D: 5, E: 1 } },
      { voterId: "4", allocations: { A: 5, B: 3, C: 1, D: 10, E: 1 } },
      { voterId: "5", allocations: { A: 1, B: 3, C: 5, D: 1, E: 10 } },
      { voterId: "6", allocations: { A: 4, B: 7, C: 2, D: 6, E: 1 } },
    ];
    const ordinary = calculateBallotSimilarityRisk({
      current: { voterId: "current", allocations: { A: 6, B: 5, C: 4, D: 3, E: 2 } },
      others,
      participants,
    });
    const copied = calculateBallotSimilarityRisk({
      current: { voterId: "current", allocations: { ...others[0]!.allocations } },
      others,
      participants,
    });

    expect(copied.strongestSimilarity).toBeCloseTo(1, 10);
    expect(copied.risk).toBeGreaterThan(ordinary.risk);
  });
});
