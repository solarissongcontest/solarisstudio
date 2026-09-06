import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROBUST_TELEVOTE_CONFIG,
  breadthFactor,
  convertRobustRound,
  effectiveSupporterCount,
  transformBallot,
} from "@/integrations/televoting/robust-televote-math";

describe("robust televote v2", () => {
  it("renormalizes every non-empty ballot to the configured equal voting power", () => {
    const result = transformBallot(
      { voterId: "one", allocations: { A: 10, B: 5, C: 3, D: 1, E: 1 } },
      ["A", "B", "C", "D", "E"],
    );

    expect(result.effectiveTotal).toBeCloseTo(20, 10);
    expect(result.allocations.A).toBeLessThan(10);
    expect(result.allocations.A).toBeGreaterThan(result.allocations.B);
    expect(result.allocations.D).toBeGreaterThan(1);
  });

  it("measures broad support as more effective supporters than concentrated support", () => {
    expect(effectiveSupporterCount([10, 10, 10, 0, 0, 0, 0, 0, 0, 0])).toBeCloseTo(3, 10);
    expect(effectiveSupporterCount([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBeCloseTo(10, 10);
  });

  it("keeps the breadth adjustment bounded", () => {
    expect(breadthFactor(0, 20)).toBeCloseTo(DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthFloor, 10);
    expect(breadthFactor(20, 20)).toBeCloseTo(1, 10);
    expect(breadthFactor(3, 20)).toBeGreaterThanOrEqual(DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthFloor);
    expect(breadthFactor(3, 20)).toBeLessThanOrEqual(1);
  });

  it("rewards broad support when entries have comparable aggregate support", () => {
    const ballots = [
      { voterId: "1", allocations: { A: 10, C: 10 } },
      { voterId: "2", allocations: { A: 10, C: 10 } },
      { voterId: "3", allocations: { A: 10, C: 10 } },
      { voterId: "4", allocations: { B: 3, C: 17 } },
      { voterId: "5", allocations: { B: 3, C: 17 } },
      { voterId: "6", allocations: { B: 3, C: 17 } },
      { voterId: "7", allocations: { B: 3, C: 17 } },
      { voterId: "8", allocations: { B: 3, C: 17 } },
      { voterId: "9", allocations: { B: 3, C: 17 } },
      { voterId: "10", allocations: { B: 3, C: 17 } },
      { voterId: "11", allocations: { B: 3, C: 17 } },
      { voterId: "12", allocations: { B: 3, C: 17 } },
      { voterId: "13", allocations: { B: 3, C: 17 } },
    ];
    const result = convertRobustRound({ participants: ["A", "B", "C"], ballots, totalPoints: 580 });
    const A = result.rows.find((row) => row.code === "A")!;
    const B = result.rows.find((row) => row.code === "B")!;

    expect(A.rawPoints).toBe(B.rawPoints);
    expect(B.effectiveSupporters).toBeGreaterThan(A.effectiveSupporters);
    expect(B.breadthFactor).toBeGreaterThan(A.breadthFactor);
    expect(B.robustSupport).toBeGreaterThan(A.robustSupport);
  });

  it("uses a bounded rank boost and distributes the point pool exactly", () => {
    const result = convertRobustRound({
      participants: ["A", "B", "C", "D", "E"],
      ballots: [
        { voterId: "1", allocations: { A: 10, B: 5, C: 3, D: 1, E: 1 } },
        { voterId: "2", allocations: { A: 8, B: 6, C: 3, D: 2, E: 1 } },
        { voterId: "3", allocations: { A: 6, B: 6, C: 4, D: 3, E: 1 } },
      ],
      totalPoints: 290,
    });

    expect(result.distributedTotal).toBe(290);
    expect(result.rows.reduce((sum, row) => sum + row.finalPoints, 0)).toBe(290);
    for (const row of result.rows) {
      expect(row.rankBoost).toBeGreaterThanOrEqual(1);
      expect(row.rankBoost).toBeLessThanOrEqual(1.8 + 1e-9);
      expect(Number.isFinite(row.finalPoints)).toBe(true);
      expect(Number.isInteger(row.finalPoints)).toBe(true);
    }
  });

  it("keeps zero-support entries at zero", () => {
    const result = convertRobustRound({
      participants: ["A", "B", "C"],
      ballots: [
        { voterId: "1", allocations: { A: 10, B: 10 } },
        { voterId: "2", allocations: { A: 8, B: 12 } },
      ],
      totalPoints: 174,
    });

    const C = result.rows.find((row) => row.code === "C")!;
    expect(C.rawPoints).toBe(0);
    expect(C.robustSupport).toBe(0);
    expect(C.weightedScore).toBe(0);
    expect(C.finalPoints).toBe(0);
  });
});
