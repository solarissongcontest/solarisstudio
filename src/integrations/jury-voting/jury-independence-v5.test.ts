import { describe, expect, it } from "vitest";

import {
  aggregateJuryIndependenceRisk,
  calculateJuryCoordinationFingerprint,
  calculateJuryDeviationRisk,
  resolveJuryIntegrityIntervention,
} from "@/integrations/jury-voting/jury-independence-v5";

describe("jury independence v5", () => {
  it("treats a large jury outlier against independent peers as strong deviation evidence", () => {
    const result = calculateJuryDeviationRisk({
      current: [{ targetCode: "OLA", score: 12, maxScore: 12 }],
      peers: [
        { voterId: "A", maxScore: 12, allocations: { OLA: 0 } },
        { voterId: "B", maxScore: 12, allocations: { OLA: 1 } },
        { voterId: "C", maxScore: 12, allocations: { OLA: 0 } },
        { voterId: "D", maxScore: 12, allocations: { OLA: 2 } },
        { voterId: "E", maxScore: 12, allocations: { OLA: 0 } },
        { voterId: "F", maxScore: 12, allocations: { OLA: 1 } },
      ],
    });

    expect(result.risk).toBeGreaterThanOrEqual(80);
    expect(result.strongestTarget).toBe("OLA");
  });

  it("does not treat a maximum score to a broadly popular entry as extreme deviation", () => {
    const result = calculateJuryDeviationRisk({
      current: [{ targetCode: "WIN", score: 12, maxScore: 12 }],
      peers: [
        { voterId: "A", maxScore: 12, allocations: { WIN: 12 } },
        { voterId: "B", maxScore: 12, allocations: { WIN: 10 } },
        { voterId: "C", maxScore: 12, allocations: { WIN: 12 } },
        { voterId: "D", maxScore: 12, allocations: { WIN: 8 } },
        { voterId: "E", maxScore: 12, allocations: { WIN: 10 } },
        { voterId: "F", maxScore: 12, allocations: { WIN: 12 } },
      ],
    });

    expect(result.risk).toBeLessThan(35);
  });

  it("requires multiple evidence families before risk can cross 50", () => {
    const result = aggregateJuryIndependenceRisk({
      components: {
        history: 100,
        deviation: 0,
        reciprocity: 0,
        coordination: 0,
        network: 0,
        crossChannel: 0,
        persistence: 0,
      },
      baseConfidence: 100,
      peerBallots: 20,
      deviationTargets: 10,
      repeatedHistory: true,
    });

    expect(result.risk).toBeLessThanOrEqual(49);
  });

  it("reserves the strongest intervention for repeated multi-family coordination", () => {
    const result = aggregateJuryIndependenceRisk({
      components: {
        history: 100,
        deviation: 100,
        reciprocity: 100,
        coordination: 100,
        network: 100,
        crossChannel: 100,
        persistence: 100,
      },
      baseConfidence: 100,
      peerBallots: 20,
      deviationTargets: 10,
      repeatedHistory: true,
    });

    expect(result.risk).toBeGreaterThanOrEqual(90);
    expect(result.interventionLevel).toBe("provisional_review");
    expect(result.recommendedSanctionLevel).toBe(5);
  });

  it("uses a jury-specific acknowledgement tier at 50 to 64", () => {
    expect(resolveJuryIntegrityIntervention({
      risk: 55,
      confidence: 60,
      evidenceFamilyCount: 2,
      repeatedHistory: false,
      currentCoordinationEvidence: false,
    })).toBe("review");
  });

  it("only treats repeated multi-peer similarity as a coordination fingerprint", () => {
    const result = calculateJuryCoordinationFingerprint({
      current: { voterId: "SELF", maxScore: 12, allocations: { A: 12, B: 10, C: 8 } },
      peers: [
        { voterId: "P1", maxScore: 12, allocations: { A: 12, B: 10, C: 8 } },
        { voterId: "P2", maxScore: 12, allocations: { A: 12, B: 10, C: 8 } },
        { voterId: "P3", maxScore: 12, allocations: { D: 12, E: 10, F: 8 } },
        { voterId: "P4", maxScore: 12, allocations: { D: 10, E: 12, F: 8 } },
        { voterId: "P5", maxScore: 12, allocations: { G: 12, H: 10, I: 8 } },
        { voterId: "P6", maxScore: 12, allocations: { G: 10, H: 12, I: 8 } },
      ],
      participants: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    });

    expect(result.matchedPeers).toBeGreaterThanOrEqual(2);
    expect(result.risk).toBeGreaterThan(0);
  });
});
