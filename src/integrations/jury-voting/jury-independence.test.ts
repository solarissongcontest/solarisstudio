import { describe, expect, it } from "vitest";

import {
  applyJuryEvidenceGates,
  calculateJuryPeerDeviation,
  resolveJuryIntervention,
} from "@/integrations/jury-voting/jury-independence";

function ballot(voterId: string, allocations: Record<string, number>) {
  return { voterId, allocations };
}

describe("jury independence model", () => {
  it("treats a strong score for a consensus favourite as low deviation evidence", () => {
    const result = calculateJuryPeerDeviation({
      current: ballot("A", { X: 12, Y: 10 }),
      others: [
        ballot("B", { X: 12, Y: 8 }),
        ballot("C", { X: 10, Y: 12 }),
        ballot("D", { X: 12, Y: 10 }),
        ballot("E", { X: 10, Y: 8 }),
      ],
      targetIds: ["X", "Y"],
    });

    expect(result.risk).toBeLessThan(35);
    expect(result.targets.find((row) => row.targetId === "X")?.risk ?? 100).toBeLessThan(35);
  });

  it("raises deviation when one jury gives maximum points to an entry peers barely support", () => {
    const result = calculateJuryPeerDeviation({
      current: ballot("A", { X: 12, Y: 10 }),
      others: [
        ballot("B", { X: 0, Y: 12 }),
        ballot("C", { X: 0, Y: 10 }),
        ballot("D", { X: 2, Y: 12 }),
        ballot("E", { X: 0, Y: 8 }),
        ballot("F", { X: 0, Y: 10 }),
      ],
      targetIds: ["X", "Y"],
    });

    expect(result.risk).toBeGreaterThan(70);
    expect(result.strongDeviationEvidence).toBe(true);
    expect(result.targets[0]?.targetId).toBe("X");
  });

  it("does not allow peer deviation alone to exceed review-level evidence", () => {
    const deviation = calculateJuryPeerDeviation({
      current: ballot("A", { X: 12 }),
      others: [
        ballot("B", { X: 0 }),
        ballot("C", { X: 0 }),
        ballot("D", { X: 0 }),
        ballot("E", { X: 0 }),
      ],
      targetIds: ["X"],
    });
    const gated = applyJuryEvidenceGates({
      baseRisk: 0,
      baseConfidence: 0,
      relationshipRisk: 0,
      deviation,
      reasonCategories: [],
      historicalEditions: 0,
      crossChannelEditions: 0,
      similarityRisk: 0,
    });

    expect(gated.risk).toBeLessThanOrEqual(49);
    expect(gated.evidenceFamilies).toEqual(["peer_deviation"]);
  });

  it("allows repeated history plus deviation and reciprocity to escalate strongly", () => {
    const deviation = calculateJuryPeerDeviation({
      current: ballot("A", { X: 12 }),
      others: [
        ballot("B", { X: 0 }),
        ballot("C", { X: 0 }),
        ballot("D", { X: 0 }),
        ballot("E", { X: 0 }),
        ballot("F", { X: 0 }),
      ],
      targetIds: ["X"],
    });
    const gated = applyJuryEvidenceGates({
      baseRisk: 78,
      baseConfidence: 72,
      relationshipRisk: 78,
      deviation,
      reasonCategories: ["reciprocal_pattern", "persistent_recent_pattern"],
      historicalEditions: 4,
      crossChannelEditions: 2,
      similarityRisk: 20,
    });

    expect(gated.risk).toBeGreaterThanOrEqual(80);
    expect(gated.evidenceFamilies.length).toBeGreaterThanOrEqual(4);
  });

  it("uses stricter jury-specific intervention thresholds", () => {
    expect(resolveJuryIntervention({ risk: 49, confidence: 100, strongCurrentCoordinationEvidence: false })).toBe("notice");
    expect(resolveJuryIntervention({ risk: 50, confidence: 10, strongCurrentCoordinationEvidence: false })).toBe("review");
    expect(resolveJuryIntervention({ risk: 65, confidence: 40, strongCurrentCoordinationEvidence: false })).toBe("declaration");
    expect(resolveJuryIntervention({ risk: 80, confidence: 60, strongCurrentCoordinationEvidence: false })).toBe("enhanced_declaration");
    expect(resolveJuryIntervention({ risk: 90, confidence: 75, strongCurrentCoordinationEvidence: true })).toBe("provisional_review");
  });
});
