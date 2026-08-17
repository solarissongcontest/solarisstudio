export type FriendVotingRiskInput = {
  uniqueEditions: number;
  opportunities: number;
  supportFrequency: number;
  maximumFrequency: number;
  reciprocalSupport: number;
  normalizedAverage: number;
  crossChannelEditions: number;
};

export type FriendVotingRiskConfig = {
  minIndependentEditions: number;
  fullConfidenceEditions: number;
  supportEditionThreshold: number;
  maximumEditionThreshold: number;
  reciprocalEditionThreshold: number;
  intensityThreshold: number;
  crossChannelMinEditions: number;
  baseConfidenceWeight: number;
  supportWeight: number;
  maximumWeight: number;
  reciprocityWeight: number;
  intensityWeight: number;
  crossChannelWeight: number;
  crossChannelPerEditionWeight: number;
  oneEditionCap: number;
  twoEditionCap: number;
};

export type FriendVotingRiskResult = {
  riskScore: number;
  confidence: number;
  reasons: string[];
};

export const DEFAULT_FRIEND_VOTING_RISK_CONFIG: FriendVotingRiskConfig = {
  minIndependentEditions: 3,
  fullConfidenceEditions: 4,
  supportEditionThreshold: 0.75,
  maximumEditionThreshold: 0.45,
  reciprocalEditionThreshold: 0.6,
  intensityThreshold: 0.5,
  crossChannelMinEditions: 2,
  baseConfidenceWeight: 20,
  supportWeight: 22,
  maximumWeight: 16,
  reciprocityWeight: 16,
  intensityWeight: 10,
  crossChannelWeight: 10,
  crossChannelPerEditionWeight: 3,
  oneEditionCap: 29,
  twoEditionCap: 49,
};

const pct = (value: number) => Math.round(value * 1000) / 10;
const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

/**
 * Relationship risk is deliberately edition-led. Jury and televote from the
 * same HOD in one edition are correlated observations, not independent people.
 * Cross-channel repetition can reinforce a pattern but cannot bypass the
 * one-edition and two-edition confidence caps.
 */
export function calculateFriendVotingRisk(
  input: FriendVotingRiskInput,
  config: FriendVotingRiskConfig = DEFAULT_FRIEND_VOTING_RISK_CONFIG,
): FriendVotingRiskResult {
  const uniqueEditions = Math.max(0, Math.trunc(input.uniqueEditions));
  const supportFrequency = clamp01(input.supportFrequency);
  const maximumFrequency = clamp01(input.maximumFrequency);
  const reciprocalSupport = clamp01(input.reciprocalSupport);
  const normalizedAverage = clamp01(input.normalizedAverage);
  const crossChannelEditions = Math.max(0, Math.min(uniqueEditions, Math.trunc(input.crossChannelEditions)));

  const fullConfidenceEditions = Math.max(1, Math.trunc(config.fullConfidenceEditions));
  const minIndependentEditions = Math.max(1, Math.trunc(config.minIndependentEditions));
  const sampleConfidence = Math.min(1, uniqueEditions / fullConfidenceEditions);
  let risk = sampleConfidence * nonNegative(config.baseConfidenceWeight);
  const reasons: string[] = [];

  if (uniqueEditions >= minIndependentEditions && supportFrequency >= clamp01(config.supportEditionThreshold)) {
    risk += nonNegative(config.supportWeight);
    reasons.push(`Repeated support in ${pct(supportFrequency)}% of observed editions across ${uniqueEditions} editions`);
  }
  if (uniqueEditions >= minIndependentEditions && maximumFrequency >= clamp01(config.maximumEditionThreshold)) {
    risk += nonNegative(config.maximumWeight);
    reasons.push(`Maximum-score concentration in ${pct(maximumFrequency)}% of observed editions`);
  }
  if (uniqueEditions >= 2 && reciprocalSupport >= clamp01(config.reciprocalEditionThreshold)) {
    risk += nonNegative(config.reciprocityWeight);
    reasons.push(`Reciprocal support in ${pct(reciprocalSupport)}% of comparable editions`);
  }
  if (uniqueEditions >= 2 && normalizedAverage >= clamp01(config.intensityThreshold)) {
    risk += nonNegative(config.intensityWeight);
    reasons.push(`High edition-balanced score intensity (${pct(normalizedAverage)}% of available maximum on average)`);
  }
  if (crossChannelEditions >= Math.max(1, Math.trunc(config.crossChannelMinEditions))) {
    risk += Math.min(
      nonNegative(config.crossChannelWeight),
      crossChannelEditions * nonNegative(config.crossChannelPerEditionWeight),
    );
    reasons.push(`Same controller supported the target in both jury and televote in ${crossChannelEditions} editions`);
  }

  if (uniqueEditions < 2) risk = Math.min(risk, Math.max(0, Math.min(100, config.oneEditionCap)));
  else if (uniqueEditions < 3) risk = Math.min(risk, Math.max(0, Math.min(100, config.twoEditionCap)));

  return {
    riskScore: Math.min(100, Math.max(0, Math.round(risk))),
    confidence: Math.min(100, Math.max(0, Math.round(sampleConfidence * 100))),
    reasons,
  };
}
