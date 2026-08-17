import { describe, expect, it } from "vitest";

import { detectCoordinationGroups, type CoordinationEdge } from "@/integrations/televoting/coordination-groups";

const edge = (
  sourcePersonId: string,
  targetPersonId: string,
  riskScore: number,
  supportEditions = 3,
): CoordinationEdge => ({
  sourcePersonId,
  sourceName: sourcePersonId,
  targetPersonId,
  targetName: targetPersonId,
  riskScore,
  confidence: 75,
  uniqueEditions: 3,
  supportEditions,
  opportunityEditions: 3,
  reciprocalSupport: 70,
  crossChannelEditions: 2,
});

const config = {
  minEdgeRisk: 65,
  minMembers: 3,
  minDensity: 0.5,
  internalShareThreshold: 0.5,
};

describe("detectCoordinationGroups", () => {
  it("surfaces a dense three-person high-risk group", () => {
    const result = detectCoordinationGroups([
      edge("A", "B", 82), edge("B", "A", 80),
      edge("A", "C", 76), edge("C", "A", 74),
      edge("B", "C", 79), edge("C", "B", 77),
    ], config);

    expect(result).toHaveLength(1);
    expect(result[0].memberIds).toEqual(["A", "B", "C"]);
    expect(result[0].density).toBe(100);
    expect(result[0].internalSupportShare).toBe(100);
  });

  it("rejects a sparse chain when density is stricter", () => {
    const result = detectCoordinationGroups([
      edge("A", "B", 80),
      edge("B", "C", 80),
      edge("C", "D", 80),
    ], { ...config, minMembers: 4, minDensity: 0.75 });

    expect(result).toHaveLength(0);
  });

  it("rejects a group when most support goes outside it", () => {
    const result = detectCoordinationGroups([
      edge("A", "B", 80, 1), edge("B", "A", 80, 1),
      edge("A", "C", 80, 1), edge("C", "A", 80, 1),
      edge("B", "C", 80, 1), edge("C", "B", 80, 1),
      edge("A", "X", 20, 10), edge("B", "Y", 20, 10), edge("C", "Z", 20, 10),
    ], { ...config, internalShareThreshold: 0.6 });

    expect(result).toHaveLength(0);
  });

  it("does not create groups from strong pairs alone when minimum members is three", () => {
    const result = detectCoordinationGroups([edge("A", "B", 95), edge("B", "A", 95)], config);
    expect(result).toHaveLength(0);
  });
});
