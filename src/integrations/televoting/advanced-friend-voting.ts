/**
 * Friend-voting model v2.
 *
 * This module is intentionally pure. It receives canonical voting observations,
 * builds voter/target baselines, controls for target-country strength, and
 * returns explainable risk components. It never decides guilt or invalidates a
 * ballot by itself.
 */

export const FRIEND_VOTING_MODEL_VERSION = "friend-voting-model-v2";

export type AdvancedFriendVotingObservation = {
  editionId: string;
  channel: "jury" | "televote";
  voterId: string;
  targetCode: string;
  score: number;
  maxScore: number;
  supported?: boolean;
  maximum?: boolean;
  rank?: number | null;
  participantCount?: number | null;
};

export type AdvancedFriendVotingNetworkSignal = {
  score?: number;
  members?: number;
  density?: number;
  internalShare?: number;
  reason?: string;
};

export type AdvancedFriendVotingConfig = {
  bayesianPriorAlpha: number;
  bayesianPriorBeta: number;
  relationshipAnomalyWeight: number;
  historicalDeviationWeight: number;
  reciprocityWeight: number;
  intensityWeight: number;
  juryWeight: number;
  televoteWeight: number;
  crossChannelWeight: number;
  networkWeight: number;
  countryStrengthWeight: number;
  minimumEvidenceForStrongRisk: number;
  oneEditionCap: number;
  twoEditionCap: number;
};

export const DEFAULT_ADVANCED_FRIEND_VOTING_CONFIG: AdvancedFriendVotingConfig = {
  bayesianPriorAlpha: 1,
  bayesianPriorBeta: 1,
  relationshipAnomalyWeight: 20,
  historicalDeviationWeight: 20,
  reciprocityWeight: 15,
  intensityWeight: 10,
  juryWeight: 10,
  televoteWeight: 10,
  crossChannelWeight: 5,
  networkWeight: 10,
  countryStrengthWeight: 0,
  minimumEvidenceForStrongRisk: 3,
  oneEditionCap: 29,
  twoEditionCap: 49,
};

export type AdvancedFriendVotingResult = {
  overallRisk: number;
  confidence: number;
  juryRisk: number;
  televoteRisk: number;
  crossChannelRisk: number;
  relationshipAnomaly: number;
  reciprocityRisk: number;
  intensityRisk: number;
  historicalDeviationRisk: number;
  networkRisk: number;
  countryStrengthRisk: number;
  reasons: string[];
  warnings: string[];
  sampleSize: {
    editions: number;
    opportunities: number;
    juryOpportunities: number;
    televoteOpportunities: number;
    historicalBaseline: number;
  };
  evidence: {
    observedSupport: number;
    eligibleSupport: number;
    smoothedSupportRate: number;
    averageScore: number;
    expectedAverageScore: number;
    maximumScores: number;
    reciprocalEditions: number;
    reciprocalSupportEditions: number;
    crossChannelEditions: number;
    historicalMaxScoreRate: number;
  };
  modelVersion: string;
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
const clamp01 = (n: number) => clamp(n, 0, 1);
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const variance = (values: number[], avg = mean(values)) => values.length > 1 ? mean(values.map((v) => (v - avg) ** 2)) : 0;
const sd = (values: number[]) => Math.sqrt(variance(values));
const pct = (n: number) => `${Math.round(clamp01(n) * 1000) / 10}%`;
const round = (n: number, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};

function betaSmoothed(successes: number, trials: number, alpha: number, beta: number) {
  if (trials <= 0) return clamp01(alpha / Math.max(1, alpha + beta));
  return clamp01((Math.max(0, successes) + Math.max(0, alpha)) / (trials + Math.max(0, alpha) + Math.max(0, beta)));
}

function scoreDeviation(observed: number, expected: number, standardDeviation: number, baselineSize: number) {
  if (baselineSize >= 2 && standardDeviation > 1e-6) return Math.abs((observed - expected) / standardDeviation);
  return Math.abs(observed - expected) / Math.max(1, Math.abs(expected), 1);
}

function deviationRisk(z: number) {
  // Saturates smoothly instead of allowing a single extreme score to dominate.
  return clamp(100 * (1 - Math.exp(-Math.min(5, Math.max(0, z)) / 1.75)));
}

function weightedAverage(parts: Array<[number, number]>) {
  const usable = parts.filter(([, weight]) => weight > 0 && Number.isFinite(weight));
  const totalWeight = usable.reduce((sum, [, weight]) => sum + weight, 0);
  return totalWeight ? usable.reduce((sum, [value, weight]) => sum + clamp(value) * weight, 0) / totalWeight : 0;
}

function dedupeByEditionChannel(observations: AdvancedFriendVotingObservation[]) {
  const map = new Map<string, AdvancedFriendVotingObservation>();
  for (const row of observations) {
    const key = `${row.editionId}:${row.channel}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row, score: Number(row.score) || 0, maxScore: Number(row.maxScore) || 0 });
      continue;
    }
    // Multiple raw rows in one edition/channel represent duplicate/incomplete
    // ingestion more often than independent evidence. Average them rather than
    // letting one edition silently acquire extra statistical weight.
    map.set(key, {
      ...existing,
      score: (existing.score + (Number(row.score) || 0)) / 2,
      maxScore: Math.max(existing.maxScore, Number(row.maxScore) || 0),
      supported: Boolean(existing.supported || row.supported || row.score > 0),
      maximum: Boolean(existing.maximum || row.maximum),
    });
  }
  return [...map.values()];
}

export function calculateAdvancedFriendVotingRisk(
  pairObservations: AdvancedFriendVotingObservation[],
  allObservations: AdvancedFriendVotingObservation[],
  reciprocalSupportRate = 0,
  reciprocalEditions = 0,
  network: AdvancedFriendVotingNetworkSignal | null = null,
  config: AdvancedFriendVotingConfig = DEFAULT_ADVANCED_FRIEND_VOTING_CONFIG,
): AdvancedFriendVotingResult {
  const pair = dedupeByEditionChannel(pairObservations);
  const all = dedupeByEditionChannel(allObservations);
  const editions = new Set(pair.map((row) => row.editionId));
  const jury = pair.filter((row) => row.channel === "jury");
  const televote = pair.filter((row) => row.channel === "televote");
  const supported = pair.filter((row) => row.supported ?? row.score > 0).length;
  const maximum = pair.filter((row) => row.maximum ?? (row.score > 0 && row.score === row.maxScore)).length;
  const opportunities = pair.length;
  const jurySupported = jury.filter((row) => row.supported ?? row.score > 0).length;
  const televoteSupported = televote.filter((row) => row.supported ?? row.score > 0).length;
  const crossChannelEditions = [...editions].filter((edition) => {
    const channels = new Set(pair.filter((row) => row.editionId === edition && (row.supported ?? row.score > 0)).map((row) => row.channel));
    return channels.has("jury") && channels.has("televote");
  }).length;

  const targetPair = pair;
  const voterId = pair[0]?.voterId;
  const voterHistory = all.filter((row) => row.voterId === voterId && row.targetCode !== pair[0]?.targetCode);
  const sameTargetHistory = all.filter((row) => row.voterId === voterId && row.targetCode === pair[0]?.targetCode && !editions.has(row.editionId));
  const baseline = sameTargetHistory.length ? sameTargetHistory : voterHistory;
  const baselineScores = baseline.map((row) => Number(row.score) || 0);
  const expectedAverage = baseline.length ? mean(baselineScores) : mean(all.filter((row) => row.voterId === voterId).map((row) => Number(row.score) || 0));
  const baselineSd = sd(baselineScores);
  const observedAverage = mean(pair.map((row) => Number(row.score) || 0));
  const historicalZ = scoreDeviation(observedAverage, expectedAverage, baselineSd, baseline.length);
  const historicalDeviationRisk = baseline.length >= 2 ? deviationRisk(historicalZ) : 0;

  const voterNormalized = all.filter((row) => row.voterId === voterId && row.maxScore > 0).map((row) => clamp01(row.score / row.maxScore));
  const pairNormalized = pair.filter((row) => row.maxScore > 0).map((row) => clamp01(row.score / row.maxScore));
  const expectedIntensity = mean(voterNormalized);
  const observedIntensity = mean(pairNormalized);
  const intensityDeviation = expectedIntensity > 0
    ? Math.abs(observedIntensity - expectedIntensity) / Math.max(0.08, expectedIntensity)
    : observedIntensity;
  const maximumRate = opportunities ? maximum / opportunities : 0;
  const historicalMaximumRate = baseline.length ? baseline.filter((row) => row.maxScore > 0 && row.score === row.maxScore && row.score > 0).length / baseline.length : 0;
  const intensityRisk = clamp(100 * (0.55 * clamp01(intensityDeviation) + 0.45 * Math.abs(maximumRate - historicalMaximumRate)));

  const smoothedSupportRate = betaSmoothed(supported, opportunities, config.bayesianPriorAlpha, config.bayesianPriorBeta);
  const relationshipAnomaly = clamp(100 * (
    0.5 * smoothedSupportRate * Math.min(1, opportunities / 8) +
    0.3 * clamp01(Math.abs(observedAverage - expectedAverage) / 12) +
    0.2 * maximumRate
  ));

  const juryRisk = jury.length
    ? weightedAverage([
        [100 * betaSmoothed(jurySupported, jury.length, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, jury.length / 8), 0.65],
        [historicalDeviationRisk, 0.35],
      ])
    : 0;
  const televoteRisk = televote.length
    ? weightedAverage([
        [100 * betaSmoothed(televoteSupported, televote.length, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, televote.length / 8), 0.65],
        [historicalDeviationRisk, 0.35],
      ])
    : 0;

  const crossChannelRate = editions.size ? crossChannelEditions / editions.size : 0;
  const crossChannelRisk = clamp(100 * crossChannelRate * Math.min(1, editions.size / 6));
  const reciprocityRisk = clamp(100 * betaSmoothed(reciprocalSupportRate * reciprocalEditions, reciprocalEditions, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, reciprocalEditions / 6));

  // Country-strength control: compare this relationship's normalized score to
  // the same target's field-wide normalized score in each edition/channel.
  const residuals: number[] = [];
  for (const row of pair) {
    const field = all.filter((candidate) => candidate.editionId === row.editionId && candidate.channel === row.channel && candidate.targetCode === row.targetCode && candidate.voterId !== row.voterId);
    if (!field.length || row.maxScore <= 0) continue;
    const fieldAvg = mean(field.filter((candidate) => candidate.maxScore > 0).map((candidate) => candidate.score / candidate.maxScore));
    residuals.push(Math.abs(clamp01(row.score / row.maxScore) - fieldAvg));
  }
  const countryStrengthRisk = clamp(100 * mean(residuals) * Math.min(1, residuals.length / 4));

  const networkRisk = clamp(network?.score ?? 0);
  const weights: Array<[number, number]> = [
    [relationshipAnomaly, config.relationshipAnomalyWeight],
    [historicalDeviationRisk, config.historicalDeviationWeight],
    [reciprocityRisk, config.reciprocityWeight],
    [intensityRisk, config.intensityWeight],
    [juryRisk, config.juryWeight],
    [televoteRisk, config.televoteWeight],
    [crossChannelRisk, config.crossChannelWeight],
    [networkRisk, config.networkWeight],
  ];
  const baseRisk = weightedAverage(weights);
  const countryStrengthAdjustment = config.countryStrengthWeight > 0
    ? (countryStrengthRisk - 50) * Math.min(1, config.countryStrengthWeight / 100)
    : 0;
  let overallRisk = clamp(baseRisk + countryStrengthAdjustment);

  // Independent historical editions are the primary sample. Channel duplication
  // cannot evade the existing small-sample safeguards.
  if (editions.size < 2) overallRisk = Math.min(overallRisk, config.oneEditionCap);
  else if (editions.size < 3) overallRisk = Math.min(overallRisk, config.twoEditionCap);

  const consistencyValues = pairNormalized.length > 1 ? pairNormalized : pair.map((row) => clamp01(row.score / Math.max(12, row.maxScore || 12)));
  const consistency = consistencyValues.length > 1 ? 1 - clamp01(sd(consistencyValues) / 0.5) : 0.5;
  const evidenceFactor = 1 - Math.exp(-Math.max(0, opportunities) / 5);
  const editionFactor = 1 - Math.exp(-Math.max(0, editions.size) / 3);
  const baselineFactor = baseline.length >= 8 ? 1 : baseline.length / 8;
  const channelFactor = pair.length ? 0.75 + 0.25 * Math.min(1, new Set(pair.map((row) => row.channel)).size / 2) : 0;
  const confidence = clamp(100 * (0.35 * evidenceFactor + 0.35 * editionFactor + 0.2 * baselineFactor + 0.1 * consistency) * channelFactor);

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (supported > 0 && smoothedSupportRate >= 0.7 && editions.size >= 2) reasons.push(`Repeated support in ${pct(supported / Math.max(1, opportunities))} of eligible observations (${supported}/${opportunities})`);
  if (baseline.length >= 2 && historicalDeviationRisk >= 60) reasons.push(`Observed average score (${round(observedAverage, 1)}) is unusually different from the voter's historical baseline (${round(expectedAverage, 1)})`);
  if (maximum > 0 && maximumRate >= 0.4 && editions.size >= 2) reasons.push(`Maximum-score concentration is ${pct(maximumRate)}, versus ${pct(historicalMaximumRate)} in the available historical baseline`);
  if (reciprocalEditions > 0 && reciprocalSupportRate >= 0.6) reasons.push(`Reciprocal support occurred in ${pct(reciprocalSupportRate)} of comparable editions (${Math.round(reciprocalSupportRate * reciprocalEditions)}/${reciprocalEditions})`);
  if (crossChannelEditions > 0) reasons.push(`The relationship appears in both jury and televote in ${crossChannelEditions} edition${crossChannelEditions === 1 ? "" : "s"}`);
  if (countryStrengthRisk < 25 && pair.length >= 2) reasons.push("The target is broadly strong in the same voting fields, reducing the relationship-specific anomaly signal");
  if (networkRisk >= 65 && network?.reason) reasons.push(network.reason);
  if (editions.size < 3) warnings.push(`Only ${editions.size} independent edition${editions.size === 1 ? "" : "s"} are available; risk is capped and should not be treated as a strong conclusion`);
  if (baseline.length < 2) warnings.push("Insufficient target-specific historical baseline; historical-deviation risk is conservatively suppressed");
  if (!jury.length) warnings.push("No jury observations are available for this relationship");
  if (!televote.length) warnings.push("No televote observations are available for this relationship");
  if (opportunities === 0) warnings.push("No eligible voting opportunities are available");

  return {
    overallRisk: Math.round(overallRisk),
    confidence: Math.round(confidence),
    juryRisk: Math.round(juryRisk),
    televoteRisk: Math.round(televoteRisk),
    crossChannelRisk: Math.round(crossChannelRisk),
    relationshipAnomaly: Math.round(relationshipAnomaly),
    reciprocityRisk: Math.round(reciprocityRisk),
    intensityRisk: Math.round(intensityRisk),
    historicalDeviationRisk: Math.round(historicalDeviationRisk),
    networkRisk: Math.round(networkRisk),
    countryStrengthRisk: Math.round(countryStrengthRisk),
    reasons,
    warnings,
    sampleSize: {
      editions: editions.size,
      opportunities,
      juryOpportunities: jury.length,
      televoteOpportunities: televote.length,
      historicalBaseline: baseline.length,
    },
    evidence: {
      observedSupport: supported,
      eligibleSupport: opportunities,
      smoothedSupportRate,
      averageScore: observedAverage,
      expectedAverageScore: expectedAverage,
      maximumScores: maximum,
      reciprocalEditions,
      reciprocalSupportEditions: Math.round(clamp01(reciprocalSupportRate) * reciprocalEditions),
      crossChannelEditions,
      historicalMaxScoreRate: historicalMaximumRate,
    },
    modelVersion: FRIEND_VOTING_MODEL_VERSION,
  };
}
