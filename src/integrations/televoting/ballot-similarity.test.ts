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

  it("does not treat one extremely similar peer as coordination-grade evidence", () => {
    const participants = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const current = { voterId: "current", allocations: { A: 10, B: 5 } };
    const result = calculateBallotSimilarityRisk({
      current,
      participants,
      others: [
        { voterId: "copy", allocations: { A: 10, B: 5 } },
        { voterId: "c", allocations: { C: 10 } },
        { voterId: "d", allocations: { D: 10 } },
        { voterId: "e", allocations: { E: 10 } },
        { voterId: "f", allocations: { F: 10 } },
        { voterId: "g", allocations: { G: 10 } },
        { voterId: "h", allocations: { H: 10 } },
        { voterId: "i", allocations: { I: 10 } },
      ],
    });

    expect(result.risk).toBeGreaterThanOrEqual(90);
    expect(result.matchedPeerCount).toBe(1);
    expect(result.currentCoordinationEvidence).toBe(false);
  });

  it("allows coordination-grade evidence when the same unusual pattern appears across multiple peers", () => {
    const participants = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const current = { voterId: "current", allocations: { A: 10, B: 5 } };
    const result = calculateBallotSimilarityRisk({
      current,
      participants,
      others: [
        { voterId: "copy-1", allocations: { A: 10, B: 5 } },
        { voterId: "copy-2", allocations: { A: 10, B: 5 } },
        { voterId: "c", allocations: { C: 10 } },
        { voterId: "d", allocations: { D: 10 } },
        { voterId: "e", allocations: { E: 10 } },
        { voterId: "f", allocations: { F: 10 } },
        { voterId: "g", allocations: { G: 10 } },
        { voterId: "h", allocations: { H: 10 } },
      ],
    });

    expect(result.risk).toBeGreaterThanOrEqual(90);
    expect(result.matchedPeerCount).toBe(2);
    expect(result.currentCoordinationEvidence).toBe(true);
  });
});
