import { describe, expect, it } from "vitest";

import { calculateFriendVotingRisk } from "@/integrations/televoting/friend-voting-math";

describe("calculateFriendVotingRisk", () => {
  it("never promotes a perfect one-edition pattern into historical suspicion", () => {
    const result = calculateFriendVotingRisk({
      uniqueEditions: 1,
      opportunities: 20,
      supportFrequency: 1,
      maximumFrequency: 1,
      reciprocalSupport: 1,
      normalizedAverage: 1,
      crossChannelEditions: 1,
    });

    expect(result.riskScore).toBeLessThanOrEqual(29);
    expect(result.confidence).toBeLessThanOrEqual(25);
  });

  it("caps two-edition evidence below the strong relationship band", () => {
    const result = calculateFriendVotingRisk({
      uniqueEditions: 2,
      opportunities: 30,
      supportFrequency: 1,
      maximumFrequency: 1,
      reciprocalSupport: 1,
      normalizedAverage: 1,
      crossChannelEditions: 2,
    });

    expect(result.riskScore).toBeLessThanOrEqual(49);
  });

  it("allows sustained three-edition patterns to cross review thresholds", () => {
    const result = calculateFriendVotingRisk({
      uniqueEditions: 3,
      opportunities: 24,
      supportFrequency: 0.9,
      maximumFrequency: 0.6,
      reciprocalSupport: 0.75,
      normalizedAverage: 0.7,
      crossChannelEditions: 2,
    });

    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.reasons.some((reason) => reason.includes("Repeated support"))).toBe(true);
  });

  it("does not let same-edition jury and televote bypass the sample cap", () => {
    const withoutCrossChannel = calculateFriendVotingRisk({
      uniqueEditions: 1,
      opportunities: 12,
      supportFrequency: 1,
      maximumFrequency: 1,
      reciprocalSupport: 1,
      normalizedAverage: 1,
      crossChannelEditions: 0,
    });
    const withCrossChannel = calculateFriendVotingRisk({
      uniqueEditions: 1,
      opportunities: 24,
      supportFrequency: 1,
      maximumFrequency: 1,
      reciprocalSupport: 1,
      normalizedAverage: 1,
      crossChannelEditions: 1,
    });

    expect(withCrossChannel.riskScore).toBeLessThanOrEqual(29);
    expect(withCrossChannel.confidence).toBeLessThanOrEqual(25);
    expect(withCrossChannel.riskScore).toBe(withoutCrossChannel.riskScore);
  });

  it("keeps weak long-term support low despite a large sample", () => {
    const result = calculateFriendVotingRisk({
      uniqueEditions: 8,
      opportunities: 60,
      supportFrequency: 0.3,
      maximumFrequency: 0.1,
      reciprocalSupport: 0.2,
      normalizedAverage: 0.25,
      crossChannelEditions: 0,
    });

    expect(result.riskScore).toBeLessThan(30);
    expect(result.reasons).toHaveLength(0);
  });
});
