import { describe, expect, it } from "vitest";
import { calculateAdvancedFriendVotingRisk } from "@/integrations/televoting/advanced-friend-voting";

const obs = (editionId: string, score: number, maxScore = 12, channel: "jury" | "televote" = "jury", targetCode = "X", voterId = "A") => ({ editionId, channel, voterId, targetCode, score, maxScore, supported: score > 0, maximum: score === maxScore && score > 0 });

describe("friend-voting model v2", () => {
  it("protects 1/1 from becoming a critical finding", () => {
    const pair = [obs("1", 12)];
    const result = calculateAdvancedFriendVotingRisk(pair, pair);
    expect(result.overallRisk).toBeLessThanOrEqual(29);
    expect(result.confidence).toBeLessThan(60);
  });

  it("distinguishes 12/12 repeated support from ordinary varied support", () => {
    const suspicious = ["1", "2", "3", "4"].map((id) => obs(id, 12));
    const ordinary = [obs("1", 5), obs("2", 7), obs("3", 6), obs("4", 8)];
    const history = [
      ...["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"].map((id) => obs(id, 4, 12)),
      ...["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"].map((id) => obs(id, 4, 12, "jury", "Y")),
    ];
    const high = calculateAdvancedFriendVotingRisk(suspicious, [...history, ...suspicious]);
    const low = calculateAdvancedFriendVotingRisk(ordinary, [...history, ...ordinary]);
    expect(high.intensityRisk).toBeGreaterThan(low.intensityRisk);
    expect(high.historicalDeviationRisk).toBeGreaterThan(low.historicalDeviationRisk);
    expect(high.overallRisk).toBeGreaterThan(low.overallRisk);
  });

  it("uses beta smoothing so 1/1 is weaker evidence than 15/16", () => {
    const one = calculateAdvancedFriendVotingRisk([obs("1", 8)], [obs("1", 8)]);
    const many = calculateAdvancedFriendVotingRisk(
      Array.from({ length: 16 }, (_, i) => obs(String(i), i === 0 ? 0 : 8)),
      Array.from({ length: 16 }, (_, i) => obs(String(i), i === 0 ? 0 : 8)),
    );
    expect(many.confidence).toBeGreaterThan(one.confidence);
    expect(many.evidence.smoothedSupportRate).toBeLessThan(1);
  });

  it("separates jury and televote evidence", () => {
    const pair = [obs("1", 10, 12, "jury"), obs("2", 10, 12, "jury"), obs("1", 9, 12, "televote"), obs("2", 9, 12, "televote")];
    const result = calculateAdvancedFriendVotingRisk(pair, pair);
    expect(result.juryRisk).toBeGreaterThan(0);
    expect(result.televoteRisk).toBeGreaterThan(0);
    expect(result.crossChannelRisk).toBeGreaterThan(0);
  });

  it("does not double-count a duplicated edition/channel observation", () => {
    const pair = [obs("1", 12), obs("1", 12), obs("2", 12)];
    const deduped = [obs("1", 12), obs("2", 12)];
    const a = calculateAdvancedFriendVotingRisk(pair, pair);
    const b = calculateAdvancedFriendVotingRisk(deduped, deduped);
    expect(a.sampleSize.opportunities).toBe(b.sampleSize.opportunities);
    expect(a.sampleSize.editions).toBe(2);
  });

  it("warns when target-specific historical baseline is unavailable", () => {
    const pair = [obs("1", 5), obs("2", 7), obs("3", 6)];
    const result = calculateAdvancedFriendVotingRisk(pair, pair);
    expect(result.warnings.some((warning) => warning.includes("historical baseline"))).toBe(true);
    expect(result.historicalDeviationRisk).toBe(0);
  });

  it("supports reciprocal evidence without treating mutual popularity as proof", () => {
    const pair = [obs("1", 8), obs("2", 8), obs("3", 8)];
    const result = calculateAdvancedFriendVotingRisk(pair, pair, 1, 3);
    expect(result.reciprocityRisk).toBeGreaterThan(0);
    expect(result.overallRisk).toBeLessThan(100);
  });
});
