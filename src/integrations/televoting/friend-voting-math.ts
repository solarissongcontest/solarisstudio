export type FriendVotingRiskInput = {
  uniqueEditions: number;
  opportunities: number;
  supportFrequency: number;
  maximumFrequency: number;
  reciprocalSupport: number;
  normalizedAverage: number;
  crossChannelEditions: number;
};

export type FriendVotingRiskResult = {
  riskScore: number;
  confidence: number;
  reasons: string[];
};

const pct = (value: number) => Math.round(value * 1000) / 10;

/**
 * Relationship risk is deliberately edition-led. Jury and televote from the
 * same HOD in one edition are correlated observations, not independent people.
 * Cross-channel repetition can reinforce a pattern but cannot bypass the
 * one-edition and two-edition confidence caps.
 */
export function calculateFriendVotingRisk(input: FriendVotingRiskInput): FriendVotingRiskResult {
  const uniqueEditions = Math.max(0, Math.trunc(input.uniqueEditions));
  const opportunities = Math.max(0, Math.trunc(input.opportunities));
  const supportFrequency = Math.max(0, Math.min(1, input.supportFrequency || 0));
  const maximumFrequency = Math.max(0, Math.min(1, input.maximumFrequency || 0));
  const reciprocalSupport = Math.max(0, Math.min(1, input.reciprocalSupport || 0));
  const normalizedAverage = Math.max(0, Math.min(1, input.normalizedAverage || 0));
  const crossChannelEditions = Math.max(0, Math.min(uniqueEditions, Math.trunc(input.crossChannelEditions)));

  const sampleConfidence = Math.min(1, uniqueEditions / 4) * Math.min(1, opportunities / 8);
  let risk = sampleConfidence * 20;
  const reasons: string[] = [];

  if (uniqueEditions >= 3 && supportFrequency >= 0.75) {
    risk += 22;
    reasons.push(`Repeated support in ${pct(supportFrequency)}% of observed opportunities across ${uniqueEditions} editions`);
  }
  if (uniqueEditions >= 3 && maximumFrequency >= 0.45) {
    risk += 16;
    reasons.push(`Maximum-score concentration ${pct(maximumFrequency)}%`);
  }
  if (uniqueEditions >= 2 && reciprocalSupport >= 0.6) {
    risk += 16;
    reasons.push(`Reciprocal support in ${pct(reciprocalSupport)}% of comparable observations`);
  }
  if (uniqueEditions >= 2 && normalizedAverage >= 0.5) {
    risk += 10;
    reasons.push(`High score intensity (${pct(normalizedAverage)}% of available maximum on average)`);
  }
  if (crossChannelEditions >= 2) {
    risk += Math.min(10, crossChannelEditions * 3);
    reasons.push(`Same controller supported the target in both jury and televote in ${crossChannelEditions} editions`);
  }

  if (uniqueEditions < 2) risk = Math.min(risk, 29);
  else if (uniqueEditions < 3) risk = Math.min(risk, 49);

  return {
    riskScore: Math.min(100, Math.max(0, Math.round(risk))),
    confidence: Math.min(100, Math.max(0, Math.round(sampleConfidence * 100))),
    reasons,
  };
}
