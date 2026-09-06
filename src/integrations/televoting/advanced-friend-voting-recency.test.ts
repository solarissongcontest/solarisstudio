import { describe, expect, it } from "vitest";

import { calculateAdvancedFriendVotingRisk } from "@/integrations/televoting/advanced-friend-voting";

const obs = (editionNumber: number, score: number, targetCode = "X") => ({
  editionId: `ssc-${editionNumber}`,
  editionNumber,
  channel: "televote" as const,
  voterId: "hod:A",
  targetCode,
  score,
  maxScore: 10,
  supported: score > 0,
  maximum: score === 10,
});

describe("friend-voting model v4 recency", () => {
  it("counts four-edition-old evidence at about sixty percent of current evidence", () => {
    const pair = [obs(26, 10), obs(22, 10)];
    const result = calculateAdvancedFriendVotingRisk(pair, pair);
    expect(result.sampleSize.effectiveRecentEditions).toBeCloseTo(1 + Math.pow(0.88, 4), 6);
  });

  it("retains older evidence in the lifetime model", () => {
    const pair = [obs(26, 10), obs(10, 10)];
    const result = calculateAdvancedFriendVotingRisk(pair, pair);
    expect(result.sampleSize.effectiveLifetimeEditions).toBeGreaterThan(result.sampleSize.effectiveRecentEditions);
    expect(result.sampleSize.effectiveLifetimeEditions).toBeGreaterThanOrEqual(1.15);
  });
});
