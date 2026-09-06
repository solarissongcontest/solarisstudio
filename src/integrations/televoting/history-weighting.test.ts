import { describe, expect, it } from "vitest";

import {
  blendRecentAndLifetime,
  editionAge,
  evidenceConfidence,
  lifetimeEditionWeight,
  recentEditionWeight,
  weightedMean,
} from "@/integrations/televoting/history-weighting";

describe("televoting history weighting", () => {
  it("keeps four-edition-old evidence at about sixty percent", () => {
    expect(recentEditionWeight(0)).toBeCloseTo(1, 8);
    expect(recentEditionWeight(1)).toBeCloseTo(0.88, 8);
    expect(recentEditionWeight(2)).toBeCloseTo(0.7744, 8);
    expect(recentEditionWeight(3)).toBeCloseTo(0.681472, 8);
    expect(recentEditionWeight(4)).toBeCloseTo(0.59969536, 8);
  });

  it("retains a lifetime evidence floor for old editions", () => {
    expect(lifetimeEditionWeight(50)).toBeCloseTo(0.15, 8);
    expect(lifetimeEditionWeight(4)).toBeCloseTo(recentEditionWeight(4), 8);
  });

  it("uses edition sequence rather than wall-clock time", () => {
    expect(editionAge(26, 25)).toBe(1);
    expect(editionAge(26, 22)).toBe(4);
    expect(editionAge(26, 30)).toBe(0);
  });

  it("lets recent observations dominate weighted historical means", () => {
    const average = weightedMean([
      { value: 10, weight: recentEditionWeight(1) },
      { value: 0, weight: recentEditionWeight(10) },
    ]);
    expect(average).toBeGreaterThan(7);
  });

  it("builds confidence smoothly from effective evidence", () => {
    expect(evidenceConfidence(0)).toBe(0);
    expect(evidenceConfidence(3)).toBeCloseTo(1 - Math.exp(-1), 8);
    expect(evidenceConfidence(9)).toBeGreaterThan(evidenceConfidence(3));
  });

  it("defaults to a 75/25 recent-lifetime blend", () => {
    expect(blendRecentAndLifetime(80, 40)).toBeCloseTo(70, 8);
  });
});
