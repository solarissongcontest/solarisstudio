import {
  DEFAULT_EDITION_DECAY,
  DEFAULT_LIFETIME_FLOOR,
  DEFAULT_LIFETIME_SHARE,
  DEFAULT_RECENT_SHARE,
  blendRecentAndLifetime,
  editionAge,
  effectiveHistoricalEvidence,
  evidenceConfidence,
  lifetimeEditionWeight,
  recentEditionWeight,
  weightedMean,
  weightedSd,
} from "@/integrations/televoting/history-weighting";

/** Pure, explainable friend-voting model v4. Statistical signals are for review, never guilt findings. */
export const FRIEND_VOTING_MODEL_VERSION = "friend-voting-model-v4";
export const FRIEND_VOTING_HISTORICAL_MODEL_VERSION = "friend-voting-historical-pattern-v1";

export type AdvancedFriendVotingObservation = {
  editionId: string;
  editionNumber?: number | null;
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

export type AdvancedFriendVotingContext = {
  similarityRisk?: number;
};

export type AdvancedFriendVotingConfig = {
  mode?: "advanced" | "historical";
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
  rankPatternWeight?: number;
  similarityWeight?: number;
  continuityWeight?: number;
  editionDecay?: number;
  lifetimeFloor?: number;
  recentHistoryShare?: number;
  lifetimeHistoryShare?: number;
  minimumEvidenceForStrongRisk: number;
  oneEditionCap: number;
  twoEditionCap: number;
};

export const DEFAULT_ADVANCED_FRIEND_VOTING_CONFIG: AdvancedFriendVotingConfig = {
  mode: "advanced",
  bayesianPriorAlpha: 1,
  bayesianPriorBeta: 1,
  relationshipAnomalyWeight: 18,
  historicalDeviationWeight: 14,
  reciprocityWeight: 14,
  intensityWeight: 10,
  juryWeight: 3,
  televoteWeight: 3,
  crossChannelWeight: 6,
  networkWeight: 12,
  countryStrengthWeight: 4,
  rankPatternWeight: 6,
  similarityWeight: 12,
  continuityWeight: 4,
  editionDecay: DEFAULT_EDITION_DECAY,
  lifetimeFloor: DEFAULT_LIFETIME_FLOOR,
  recentHistoryShare: DEFAULT_RECENT_SHARE,
  lifetimeHistoryShare: DEFAULT_LIFETIME_SHARE,
  minimumEvidenceForStrongRisk: 3,
  oneEditionCap: 29,
  twoEditionCap: 49,
};

export type AdvancedFriendVotingResult = {
  overallRisk: number;
  recentRisk: number;
  lifetimeRisk: number;
  confidence: number;
  juryRisk: number;
  televoteRisk: number;
  crossChannelRisk: number;
  relationshipAnomaly: number;
  reciprocityRisk: number;
  intensityRisk: number;
  historicalDeviationRisk: number;
  rankPatternRisk: number;
  networkRisk: number;
  countryStrengthRisk: number;
  similarityRisk: number;
  continuityRisk: number;
  reasons: string[];
  warnings: string[];
  sampleSize: {
    editions: number;
    opportunities: number;
    juryOpportunities: number;
    televoteOpportunities: number;
    historicalBaseline: number;
    effectiveRecentEditions: number;
    effectiveLifetimeEditions: number;
  };
  evidence: {
    observedSupport: number;
    eligibleSupport: number;
    smoothedSupportRate: number;
    recentSupportRate: number;
    lifetimeSupportRate: number;
    averageScore: number;
    expectedAverageScore: number;
    maximumScores: number;
    reciprocalEditions: number;
    reciprocalSupportEditions: number;
    crossChannelEditions: number;
    historicalMaxScoreRate: number;
    observedRankPercentile: number;
    expectedRankPercentile: number;
    currentStreak: number;
    effectiveHistoricalEvidence: number;
  };
  modelVersion: string;
};

type Aggregate = { total: number; count: number };
type FieldAggregate = Aggregate & { byVoter: Map<string, Aggregate> };
type PreparedHistory = {
  all: AdvancedFriendVotingObservation[];
  byVoter: Map<string, AdvancedFriendVotingObservation[]>;
  byVoterTarget: Map<string, AdvancedFriendVotingObservation[]>;
  fieldIntensity: Map<string, FieldAggregate>;
};

const preparedHistoryCache = new WeakMap<AdvancedFriendVotingObservation[], PreparedHistory>();
const currentEditionNumberCache = new WeakMap<AdvancedFriendVotingObservation[], number | null>();
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
const clamp01 = (n: number) => clamp(n, 0, 1);
const mean = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};
const pct = (n: number) => `${Math.round(clamp01(n) * 1000) / 10}%`;
const round = (n: number, d = 2) => {
  const p = 10 ** d;
  return Math.round(n * p) / p;
};

function beta(successes: number, trials: number, alpha: number, betaPrior: number) {
  return trials <= 0
    ? clamp01(alpha / Math.max(1, alpha + betaPrior))
    : clamp01((Math.max(0, successes) + Math.max(0, alpha)) / (trials + Math.max(0, alpha) + Math.max(0, betaPrior)));
}

function zRisk(z: number) {
  return clamp(100 * (1 - Math.exp(-Math.min(5, Math.max(0, z)) / 1.75)));
}

function weighted(parts: Array<[number, number]>) {
  const usable = parts.filter(([, weight]) => weight > 0 && Number.isFinite(weight));
  const total = usable.reduce((sum, [, weight]) => sum + weight, 0);
  return total ? usable.reduce((sum, [value, weight]) => sum + clamp(value) * weight, 0) / total : 0;
}

function rankPercentile(row: AdvancedFriendVotingObservation) {
  const rank = Number(row.rank);
  const participants = Number(row.participantCount);
  if (!Number.isFinite(rank) || !Number.isFinite(participants) || rank < 1 || participants < 2) return null;
  return clamp01(1 - (rank - 1) / Math.max(1, participants - 1));
}

function dedupe(rows: AdvancedFriendVotingObservation[], relationshipScope: boolean) {
  const map = new Map<string, AdvancedFriendVotingObservation>();
  for (const row of rows) {
    const key = relationshipScope
      ? `${row.editionId}:${row.channel}`
      : `${row.editionId}:${row.channel}:${row.voterId}:${row.targetCode}`;
    const old = map.get(key);
    if (!old) {
      map.set(key, {
        ...row,
        score: Number(row.score) || 0,
        maxScore: Number(row.maxScore) || 0,
        editionNumber: row.editionNumber == null ? null : Number(row.editionNumber),
        rank: row.rank == null ? null : Number(row.rank),
        participantCount: row.participantCount == null ? null : Number(row.participantCount),
      });
      continue;
    }
    const oldRank = old.rank == null ? null : Number(old.rank);
    const nextRank = row.rank == null ? null : Number(row.rank);
    map.set(key, {
      ...old,
      score: (old.score + (Number(row.score) || 0)) / 2,
      maxScore: Math.max(old.maxScore, Number(row.maxScore) || 0),
      editionNumber: Math.max(Number(old.editionNumber ?? -Infinity), Number(row.editionNumber ?? -Infinity)),
      supported: Boolean(old.supported || row.supported || row.score > 0),
      maximum: Boolean(old.maximum || row.maximum),
      rank: oldRank == null ? nextRank : nextRank == null ? oldRank : (oldRank + nextRank) / 2,
      participantCount: Math.max(Number(old.participantCount ?? 0), Number(row.participantCount ?? 0)) || null,
    });
  }
  return [...map.values()];
}

function addToMapList(map: Map<string, AdvancedFriendVotingObservation[]>, key: string, row: AdvancedFriendVotingObservation) {
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function prepareHistory(allObservations: AdvancedFriendVotingObservation[]): PreparedHistory {
  const cached = preparedHistoryCache.get(allObservations);
  if (cached) return cached;

  const all = dedupe(allObservations, false);
  const byVoter = new Map<string, AdvancedFriendVotingObservation[]>();
  const byVoterTarget = new Map<string, AdvancedFriendVotingObservation[]>();
  const fieldIntensity = new Map<string, FieldAggregate>();

  for (const row of all) {
    addToMapList(byVoter, row.voterId, row);
    addToMapList(byVoterTarget, `${row.voterId}\u0000${row.targetCode}`, row);

    if (row.maxScore > 0) {
      const normalized = clamp01(row.score / row.maxScore);
      const fieldKey = `${row.editionId}:${row.channel}:${row.targetCode}`;
      const field = fieldIntensity.get(fieldKey) ?? { total: 0, count: 0, byVoter: new Map<string, Aggregate>() };
      field.total += normalized;
      field.count += 1;
      const voterField = field.byVoter.get(row.voterId) ?? { total: 0, count: 0 };
      voterField.total += normalized;
      voterField.count += 1;
      field.byVoter.set(row.voterId, voterField);
      fieldIntensity.set(fieldKey, field);
    }
  }

  const prepared = { all, byVoter, byVoterTarget, fieldIntensity };
  preparedHistoryCache.set(allObservations, prepared);
  return prepared;
}

function resolveCurrentEditionNumber(rows: AdvancedFriendVotingObservation[]) {
  let current: number | null = null;
  for (const row of rows) {
    const value = Number(row.editionNumber);
    if (!Number.isFinite(value)) continue;
    if (current == null || value > current) current = value;
  }
  return current;
}

function resolveCurrentEditionNumberCached(rows: AdvancedFriendVotingObservation[]) {
  if (currentEditionNumberCache.has(rows)) return currentEditionNumberCache.get(rows) ?? null;
  const currentEditionNumber = resolveCurrentEditionNumber(rows);
  currentEditionNumberCache.set(rows, currentEditionNumber);
  return currentEditionNumber;
}

function rowWeight(
  row: AdvancedFriendVotingObservation,
  currentEditionNumber: number | null,
  config: AdvancedFriendVotingConfig,
  lifetime = false,
) {
  if (currentEditionNumber == null || row.editionNumber == null || !Number.isFinite(Number(row.editionNumber))) return 1;
  const age = editionAge(currentEditionNumber, Number(row.editionNumber));
  return lifetime
    ? lifetimeEditionWeight(age, config.editionDecay, config.lifetimeFloor)
    : recentEditionWeight(age, config.editionDecay);
}

function weightedRate(
  rows: AdvancedFriendVotingObservation[],
  predicate: (row: AdvancedFriendVotingObservation) => boolean,
  currentEditionNumber: number | null,
  config: AdvancedFriendVotingConfig,
  lifetime = false,
) {
  const weights = rows.map((row) => rowWeight(row, currentEditionNumber, config, lifetime));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  const successes = rows.reduce(
    (sum, row, index) => sum + (predicate(row) ? weights[index]! : 0),
    0,
  );
  return successes / total;
}

function weightedAverageScore(
  rows: AdvancedFriendVotingObservation[],
  currentEditionNumber: number | null,
  config: AdvancedFriendVotingConfig,
  lifetime = false,
) {
  return weightedMean(rows.map((row) => ({
    value: Number(row.score) || 0,
    weight: rowWeight(row, currentEditionNumber, config, lifetime),
  })));
}

function consecutiveSupportStreak(rows: AdvancedFriendVotingObservation[]) {
  const supportedEditionNumbers = [...new Set(
    rows
      .filter((row) => row.supported ?? row.score > 0)
      .map((row) => Number(row.editionNumber))
      .filter((value) => Number.isFinite(value)),
  )].sort((a, b) => b - a);
  if (!supportedEditionNumbers.length) return 0;
  let streak = 1;
  for (let index = 1; index < supportedEditionNumbers.length; index += 1) {
    if (supportedEditionNumbers[index - 1]! - supportedEditionNumbers[index]! !== 1) break;
    streak += 1;
  }
  return streak;
}

function calculateHistoricalPatternRisk(
  pair: AdvancedFriendVotingObservation[],
  reciprocalSupportRate: number,
  reciprocalEditions: number,
): AdvancedFriendVotingResult {
  const editions = new Set(pair.map((row) => row.editionId));
  const jury = pair.filter((row) => row.channel === "jury");
  const televote = pair.filter((row) => row.channel === "televote");
  const supportedRows = pair.filter((row) => row.supported ?? row.score > 0);
  const supported = supportedRows.length;
  const maximum = pair.filter((row) => row.maximum ?? (row.score > 0 && row.score === row.maxScore)).length;
  const opportunities = pair.length;
  const supportRate = opportunities ? supported / opportunities : 0;
  const maximumRate = opportunities ? maximum / opportunities : 0;
  const averageScore = opportunities ? pair.reduce((sum, row) => sum + Number(row.score || 0), 0) / opportunities : 0;
  const normalizedAverage = opportunities
    ? pair.reduce((sum, row) => sum + (row.maxScore > 0 ? clamp01(row.score / row.maxScore) : 0), 0) / opportunities
    : 0;

  const channelsByEdition = new Map<string, Set<string>>();
  for (const row of supportedRows) {
    const channels = channelsByEdition.get(row.editionId) ?? new Set<string>();
    channels.add(row.channel);
    channelsByEdition.set(row.editionId, channels);
  }
  const crossChannelEditions = [...channelsByEdition.values()].filter(
    (channels) => channels.has("jury") && channels.has("televote"),
  ).length;
  const crossChannelRate = editions.size ? crossChannelEditions / editions.size : 0;
  const evidenceFactor = Math.min(1, editions.size / 5);
  const channelFactor = jury.length && televote.length ? 1 : 0.8;
  const relationshipPattern = clamp(100 * supportRate * evidenceFactor);
  const intensityRisk = clamp(100 * normalizedAverage * evidenceFactor);
  const reciprocityRisk = clamp(100 * clamp01(reciprocalSupportRate) * Math.min(1, reciprocalEditions / 4));
  const crossChannelRisk = clamp(100 * crossChannelRate * evidenceFactor);
  const overallRisk = clamp(100 * (
    0.5 * supportRate
    + 0.2 * maximumRate
    + 0.15 * clamp01(reciprocalSupportRate)
    + 0.1 * crossChannelRate
    + 0.05 * normalizedAverage
  ) * evidenceFactor);
  const confidence = clamp(100 * evidenceFactor * channelFactor);
  const jurySupportRate = jury.length ? jury.filter((row) => row.supported ?? row.score > 0).length / jury.length : 0;
  const televoteSupportRate = televote.length ? televote.filter((row) => row.supported ?? row.score > 0).length / televote.length : 0;
  const juryRisk = clamp(100 * jurySupportRate * Math.min(1, new Set(jury.map((row) => row.editionId)).size / 5));
  const televoteRisk = clamp(100 * televoteSupportRate * Math.min(1, new Set(televote.map((row) => row.editionId)).size / 5));
  const reasons: string[] = [];
  if (editions.size >= 2 && supportRate >= 0.6) reasons.push(`Support appears in ${pct(supportRate)} of the available relationship observations`);
  if (editions.size >= 2 && maximumRate >= 0.3) reasons.push(`Maximum-score support appears in ${pct(maximumRate)} of the available relationship observations`);
  if (reciprocalEditions > 0 && reciprocalSupportRate >= 0.5) reasons.push(`Reciprocal support appears in ${pct(reciprocalSupportRate)} of comparable editions`);
  if (crossChannelEditions > 0) reasons.push(`Support appears in both jury and televote in ${crossChannelEditions} edition${crossChannelEditions === 1 ? "" : "s"}`);

  const warnings = [
    "Historical summary mode uses descriptive relationship-pattern strength only; advanced anomaly, baseline-deviation, similarity and network signals are not calculated.",
  ];
  if (editions.size < 3) warnings.push("Limited edition history; pattern score is deliberately capped by the available evidence.");

  return {
    overallRisk: Math.round(overallRisk),
    recentRisk: Math.round(overallRisk),
    lifetimeRisk: Math.round(overallRisk),
    confidence: Math.round(confidence),
    juryRisk: Math.round(juryRisk),
    televoteRisk: Math.round(televoteRisk),
    crossChannelRisk: Math.round(crossChannelRisk),
    relationshipAnomaly: Math.round(relationshipPattern),
    reciprocityRisk: Math.round(reciprocityRisk),
    intensityRisk: Math.round(intensityRisk),
    historicalDeviationRisk: 0,
    rankPatternRisk: 0,
    networkRisk: 0,
    countryStrengthRisk: 0,
    similarityRisk: 0,
    continuityRisk: 0,
    reasons,
    warnings,
    sampleSize: {
      editions: editions.size,
      opportunities,
      juryOpportunities: jury.length,
      televoteOpportunities: televote.length,
      historicalBaseline: 0,
      effectiveRecentEditions: editions.size,
      effectiveLifetimeEditions: editions.size,
    },
    evidence: {
      observedSupport: supported,
      eligibleSupport: opportunities,
      smoothedSupportRate: supportRate,
      recentSupportRate: supportRate,
      lifetimeSupportRate: supportRate,
      averageScore,
      expectedAverageScore: 0,
      maximumScores: maximum,
      reciprocalEditions,
      reciprocalSupportEditions: Math.round(clamp01(reciprocalSupportRate) * reciprocalEditions),
      crossChannelEditions,
      historicalMaxScoreRate: 0,
      observedRankPercentile: 0,
      expectedRankPercentile: 0,
      currentStreak: 0,
      effectiveHistoricalEvidence: editions.size,
    },
    modelVersion: FRIEND_VOTING_HISTORICAL_MODEL_VERSION,
  };
}

export function calculateAdvancedFriendVotingRisk(
  pairObservations: AdvancedFriendVotingObservation[],
  allObservations: AdvancedFriendVotingObservation[],
  reciprocalSupportRate = 0,
  reciprocalEditions = 0,
  network: AdvancedFriendVotingNetworkSignal | null = null,
  configInput: AdvancedFriendVotingConfig = DEFAULT_ADVANCED_FRIEND_VOTING_CONFIG,
  context: AdvancedFriendVotingContext = {},
): AdvancedFriendVotingResult {
  const config = { ...DEFAULT_ADVANCED_FRIEND_VOTING_CONFIG, ...configInput };
  const pair = dedupe(pairObservations, true);
  if (config.mode === "historical") {
    return calculateHistoricalPatternRisk(pair, reciprocalSupportRate, reciprocalEditions);
  }

  const history = prepareHistory(allObservations);
  const editions = new Set(pair.map((row) => row.editionId));
  const jury = pair.filter((row) => row.channel === "jury");
  const televote = pair.filter((row) => row.channel === "televote");
  const supported = pair.filter((row) => row.supported ?? row.score > 0).length;
  const maximum = pair.filter((row) => row.maximum ?? (row.score > 0 && row.score === row.maxScore)).length;
  const opportunities = pair.length;
  const voterId = pair[0]?.voterId ?? "";
  const targetCode = pair[0]?.targetCode ?? "";
  const currentEditionNumber = resolveCurrentEditionNumberCached(allObservations);

  const targetRows = history.byVoterTarget.get(`${voterId}\u0000${targetCode}`) ?? [];
  const targetHistory = targetRows.filter((row) => !editions.has(row.editionId));
  const voterRows = history.byVoter.get(voterId) ?? [];
  const voterHistory = voterRows.filter((row) => row.targetCode !== targetCode);
  const baseline = targetHistory.length ? targetHistory : voterHistory;

  const recentSupportRateRaw = weightedRate(pair, (row) => row.supported ?? row.score > 0, currentEditionNumber, config, false);
  const lifetimeSupportRateRaw = weightedRate(pair, (row) => row.supported ?? row.score > 0, currentEditionNumber, config, true);
  const recentOpportunityWeight = pair.reduce((sum, row) => sum + rowWeight(row, currentEditionNumber, config, false), 0);
  const lifetimeOpportunityWeight = pair.reduce((sum, row) => sum + rowWeight(row, currentEditionNumber, config, true), 0);
  const recentSupportWeight = pair.reduce(
    (sum, row) => sum + ((row.supported ?? row.score > 0) ? rowWeight(row, currentEditionNumber, config, false) : 0),
    0,
  );
  const lifetimeSupportWeight = pair.reduce(
    (sum, row) => sum + ((row.supported ?? row.score > 0) ? rowWeight(row, currentEditionNumber, config, true) : 0),
    0,
  );
  const recentSupportRate = beta(recentSupportWeight, recentOpportunityWeight, config.bayesianPriorAlpha, config.bayesianPriorBeta);
  const lifetimeSupportRate = beta(lifetimeSupportWeight, lifetimeOpportunityWeight, config.bayesianPriorAlpha, config.bayesianPriorBeta);
  const smoothedSupportRate = blendRecentAndLifetime(
    recentSupportRate,
    lifetimeSupportRate,
    config.recentHistoryShare,
    config.lifetimeHistoryShare,
  );

  const observedAverageRecent = weightedAverageScore(pair, currentEditionNumber, config, false);
  const observedAverageLifetime = weightedAverageScore(pair, currentEditionNumber, config, true);
  const expectedAverageRecent = weightedAverageScore(baseline, currentEditionNumber, config, false);
  const expectedAverageLifetime = weightedAverageScore(baseline, currentEditionNumber, config, true);
  const baselineRecentScores = baseline.map((row) => ({
    value: Number(row.score) || 0,
    weight: rowWeight(row, currentEditionNumber, config, false),
  }));
  const baselineLifetimeScores = baseline.map((row) => ({
    value: Number(row.score) || 0,
    weight: rowWeight(row, currentEditionNumber, config, true),
  }));
  const recentDeviation = baseline.length >= 2 && expectedAverageRecent !== 0
    ? zRisk(Math.abs(observedAverageRecent - expectedAverageRecent) / Math.max(weightedSd(baselineRecentScores), 1))
    : 0;
  const lifetimeDeviation = baseline.length >= 2 && expectedAverageLifetime !== 0
    ? zRisk(Math.abs(observedAverageLifetime - expectedAverageLifetime) / Math.max(weightedSd(baselineLifetimeScores), 1))
    : 0;
  const historicalDeviationRisk = blendRecentAndLifetime(
    recentDeviation,
    lifetimeDeviation,
    config.recentHistoryShare,
    config.lifetimeHistoryShare,
  );

  const pairIntensityRecent = weightedMean(pair.filter((row) => row.maxScore > 0).map((row) => ({
    value: clamp01(row.score / row.maxScore),
    weight: rowWeight(row, currentEditionNumber, config, false),
  })));
  const pairIntensityLifetime = weightedMean(pair.filter((row) => row.maxScore > 0).map((row) => ({
    value: clamp01(row.score / row.maxScore),
    weight: rowWeight(row, currentEditionNumber, config, true),
  })));
  const baselineIntensityRecent = weightedMean(baseline.filter((row) => row.maxScore > 0).map((row) => ({
    value: clamp01(row.score / row.maxScore),
    weight: rowWeight(row, currentEditionNumber, config, false),
  })));
  const baselineIntensityLifetime = weightedMean(baseline.filter((row) => row.maxScore > 0).map((row) => ({
    value: clamp01(row.score / row.maxScore),
    weight: rowWeight(row, currentEditionNumber, config, true),
  })));
  const maximumRateRecent = weightedRate(pair, (row) => row.maximum ?? (row.score > 0 && row.score === row.maxScore), currentEditionNumber, config, false);
  const maximumRateLifetime = weightedRate(pair, (row) => row.maximum ?? (row.score > 0 && row.score === row.maxScore), currentEditionNumber, config, true);
  const historicalMaximumRate = weightedRate(baseline, (row) => row.maxScore > 0 && row.score === row.maxScore && row.score > 0, currentEditionNumber, config, false);
  const intensityRecent = clamp(100 * (
    0.55 * clamp01(Math.abs(pairIntensityRecent - baselineIntensityRecent) / Math.max(0.08, baselineIntensityRecent || 0.08))
    + 0.45 * Math.abs(maximumRateRecent - historicalMaximumRate)
  ));
  const intensityLifetime = clamp(100 * (
    0.55 * clamp01(Math.abs(pairIntensityLifetime - baselineIntensityLifetime) / Math.max(0.08, baselineIntensityLifetime || 0.08))
    + 0.45 * Math.abs(maximumRateLifetime - historicalMaximumRate)
  ));
  const intensityRisk = blendRecentAndLifetime(intensityRecent, intensityLifetime, config.recentHistoryShare, config.lifetimeHistoryShare);

  const relationshipRecent = clamp(100 * (
    0.5 * recentSupportRate * Math.min(1, recentOpportunityWeight / 4)
    + 0.3 * clamp01(Math.abs(observedAverageRecent - expectedAverageRecent) / 12)
    + 0.2 * maximumRateRecent
  ));
  const relationshipLifetime = clamp(100 * (
    0.5 * lifetimeSupportRate * Math.min(1, lifetimeOpportunityWeight / 6)
    + 0.3 * clamp01(Math.abs(observedAverageLifetime - expectedAverageLifetime) / 12)
    + 0.2 * maximumRateLifetime
  ));
  const relationshipAnomaly = blendRecentAndLifetime(
    relationshipRecent,
    relationshipLifetime,
    config.recentHistoryShare,
    config.lifetimeHistoryShare,
  );

  const juryRecentWeight = jury.reduce((sum, row) => sum + rowWeight(row, currentEditionNumber, config, false), 0);
  const televoteRecentWeight = televote.reduce((sum, row) => sum + rowWeight(row, currentEditionNumber, config, false), 0);
  const jurySupportWeight = jury.reduce((sum, row) => sum + ((row.supported ?? row.score > 0) ? rowWeight(row, currentEditionNumber, config, false) : 0), 0);
  const televoteSupportWeight = televote.reduce((sum, row) => sum + ((row.supported ?? row.score > 0) ? rowWeight(row, currentEditionNumber, config, false) : 0), 0);
  const juryRisk = jury.length
    ? weighted([
        [100 * beta(jurySupportWeight, juryRecentWeight, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, juryRecentWeight / 4), 0.65],
        [historicalDeviationRisk, 0.35],
      ])
    : 0;
  const televoteRisk = televote.length
    ? weighted([
        [100 * beta(televoteSupportWeight, televoteRecentWeight, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, televoteRecentWeight / 4), 0.65],
        [historicalDeviationRisk, 0.35],
      ])
    : 0;

  const channelsByEdition = new Map<string, { channels: Set<string>; weight: number }>();
  for (const row of pair) {
    if (!(row.supported ?? row.score > 0)) continue;
    const current = channelsByEdition.get(row.editionId) ?? {
      channels: new Set<string>(),
      weight: rowWeight(row, currentEditionNumber, config, false),
    };
    current.channels.add(row.channel);
    current.weight = Math.max(current.weight, rowWeight(row, currentEditionNumber, config, false));
    channelsByEdition.set(row.editionId, current);
  }
  const crossChannelRows = [...channelsByEdition.values()];
  const crossChannelWeight = crossChannelRows
    .filter((row) => row.channels.has("jury") && row.channels.has("televote"))
    .reduce((sum, row) => sum + row.weight, 0);
  const supportedEditionWeight = crossChannelRows.reduce((sum, row) => sum + row.weight, 0);
  const crossChannelEditions = crossChannelRows.filter((row) => row.channels.has("jury") && row.channels.has("televote")).length;
  const crossChannelRisk = clamp(100 * (supportedEditionWeight > 0 ? crossChannelWeight / supportedEditionWeight : 0) * Math.min(1, supportedEditionWeight / 3));
  const reciprocityRisk = clamp(100 * beta(
    reciprocalSupportRate * reciprocalEditions,
    reciprocalEditions,
    config.bayesianPriorAlpha,
    config.bayesianPriorBeta,
  ) * Math.min(1, reciprocalEditions / 4));
  const networkRisk = clamp(network?.score ?? 0);
  const similarityRisk = clamp(context.similarityRisk ?? 0);

  const residuals: Array<{ value: number; weight: number }> = [];
  for (const row of pair) {
    if (row.maxScore <= 0) continue;
    const field = history.fieldIntensity.get(`${row.editionId}:${row.channel}:${row.targetCode}`);
    if (!field) continue;
    const own = field.byVoter.get(row.voterId) ?? { total: 0, count: 0 };
    const othersCount = field.count - own.count;
    if (othersCount <= 0) continue;
    const fieldAverage = (field.total - own.total) / othersCount;
    residuals.push({
      value: Math.abs(clamp01(row.score / row.maxScore) - fieldAverage),
      weight: rowWeight(row, currentEditionNumber, config, false),
    });
  }
  const countryStrengthRisk = clamp(100 * weightedMean(residuals) * Math.min(1, effectiveHistoricalEvidence(residuals.map((row) => row.weight)) / 3));

  const observedRankRows = pair.map((row) => ({ row, value: rankPercentile(row) })).filter((item): item is { row: AdvancedFriendVotingObservation; value: number } => item.value != null);
  const baselineRankRows = baseline.map((row) => ({ row, value: rankPercentile(row) })).filter((item): item is { row: AdvancedFriendVotingObservation; value: number } => item.value != null);
  const observedRankPercentile = weightedMean(observedRankRows.map((item) => ({ value: item.value, weight: rowWeight(item.row, currentEditionNumber, config, false) })));
  const expectedRankPercentile = weightedMean(baselineRankRows.map((item) => ({ value: item.value, weight: rowWeight(item.row, currentEditionNumber, config, false) })));
  const baselineRankSd = weightedSd(baselineRankRows.map((item) => ({ value: item.value, weight: rowWeight(item.row, currentEditionNumber, config, false) })));
  const positiveRankShift = Math.max(0, observedRankPercentile - expectedRankPercentile);
  const rankZ = baselineRankRows.length >= 2 ? positiveRankShift / Math.max(baselineRankSd, 0.12) : 0;
  const topQuartileRate = observedRankRows.length
    ? weightedMean(observedRankRows.map((item) => ({ value: item.value >= 0.75 ? 1 : 0, weight: rowWeight(item.row, currentEditionNumber, config, false) })))
    : 0;
  const historicalTopQuartileRate = baselineRankRows.length
    ? weightedMean(baselineRankRows.map((item) => ({ value: item.value >= 0.75 ? 1 : 0, weight: rowWeight(item.row, currentEditionNumber, config, false) })))
    : 0;
  const rankPatternRisk = observedRankRows.length && baselineRankRows.length >= 2
    ? clamp(0.7 * zRisk(rankZ) + 30 * Math.max(0, topQuartileRate - historicalTopQuartileRate))
    : 0;

  const currentStreak = consecutiveSupportStreak(pair);
  const continuityRisk = currentStreak >= 2
    ? clamp(100 * (1 - Math.exp(-(currentStreak - 1) / 2)))
    : 0;

  const recentRisk = weighted([
    [relationshipRecent, config.relationshipAnomalyWeight],
    [recentDeviation, config.historicalDeviationWeight],
    [reciprocityRisk, config.reciprocityWeight],
    [intensityRecent, config.intensityWeight],
    [juryRisk, config.juryWeight],
    [televoteRisk, config.televoteWeight],
    [crossChannelRisk, config.crossChannelWeight],
    [rankPatternRisk, config.rankPatternWeight ?? 6],
    [networkRisk, config.networkWeight],
    [countryStrengthRisk, config.countryStrengthWeight],
    [similarityRisk, config.similarityWeight ?? 12],
    [continuityRisk, config.continuityWeight ?? 4],
  ]);
  const lifetimeRisk = weighted([
    [relationshipLifetime, config.relationshipAnomalyWeight],
    [lifetimeDeviation, config.historicalDeviationWeight],
    [reciprocityRisk, config.reciprocityWeight],
    [intensityLifetime, config.intensityWeight],
    [juryRisk, config.juryWeight],
    [televoteRisk, config.televoteWeight],
    [crossChannelRisk, config.crossChannelWeight],
    [rankPatternRisk, config.rankPatternWeight ?? 6],
    [networkRisk, config.networkWeight],
    [countryStrengthRisk, config.countryStrengthWeight],
    [similarityRisk, config.similarityWeight ?? 12],
    [continuityRisk, config.continuityWeight ?? 4],
  ]);

  const independentSignals = [
    relationshipAnomaly,
    historicalDeviationRisk,
    reciprocityRisk,
    intensityRisk,
    crossChannelRisk,
    rankPatternRisk,
    networkRisk,
    countryStrengthRisk,
    similarityRisk,
    continuityRisk,
  ];
  const strongSignalCount = independentSignals.filter((value) => value >= 65).length;
  const corroborationBonus = Math.min(10, Math.max(0, strongSignalCount - 1) * 2.5);
  let overallRisk = clamp(
    blendRecentAndLifetime(recentRisk, lifetimeRisk, config.recentHistoryShare, config.lifetimeHistoryShare) + corroborationBonus,
  );

  const editionRecentWeights = [...new Map(pair.map((row) => [row.editionId, rowWeight(row, currentEditionNumber, config, false)])).values()];
  const editionLifetimeWeights = [...new Map(pair.map((row) => [row.editionId, rowWeight(row, currentEditionNumber, config, true)])).values()];
  const effectiveRecentEditions = effectiveHistoricalEvidence(editionRecentWeights);
  const effectiveLifetimeEditions = effectiveHistoricalEvidence(editionLifetimeWeights);
  if (effectiveRecentEditions < 1.5) overallRisk = Math.min(overallRisk, config.oneEditionCap);
  else if (effectiveRecentEditions < 2.5) overallRisk = Math.min(overallRisk, config.twoEditionCap);

  const baselineEffectiveEvidence = effectiveHistoricalEvidence(baseline.map((row) => rowWeight(row, currentEditionNumber, config, false)));
  const historyEvidenceFactor = evidenceConfidence(effectiveRecentEditions, 3);
  const baselineFactor = evidenceConfidence(baselineEffectiveEvidence, 3);
  const channelFactor = pair.length ? (new Set(pair.map((row) => row.channel)).size >= 2 ? 1 : 0.65) : 0;
  const corroborationFactor = Math.min(1, strongSignalCount / 3);
  const confidence = clamp(100 * (
    0.5 * historyEvidenceFactor
    + 0.2 * channelFactor
    + 0.15 * baselineFactor
    + 0.15 * corroborationFactor
  ));

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (supported && recentSupportRateRaw >= 0.7 && effectiveRecentEditions >= 1.5) {
    reasons.push(`Recent-weighted support is ${pct(recentSupportRateRaw)} across the available relationship history`);
  }
  if (baseline.length >= 2 && historicalDeviationRisk >= 60) {
    reasons.push(`Recent-weighted average score (${round(observedAverageRecent, 1)}) differs unusually from the historical baseline (${round(expectedAverageRecent, 1)})`);
  }
  if (rankPatternRisk >= 60) reasons.push("The target is ranked unusually high compared with this voter's historical rank pattern");
  if (maximumRateRecent >= 0.4 && effectiveRecentEditions >= 1.5) {
    reasons.push(`Recent maximum-score concentration is ${pct(maximumRateRecent)}, versus ${pct(historicalMaximumRate)} in the available baseline`);
  }
  if (reciprocalEditions && reciprocalSupportRate >= 0.6) reasons.push(`Reciprocal support occurred in ${pct(reciprocalSupportRate)} of comparable editions`);
  if (crossChannelEditions) reasons.push(`The relationship appears in both jury and televote in ${crossChannelEditions} edition${crossChannelEditions === 1 ? "" : "s"}`);
  if (similarityRisk >= 65) reasons.push("The ballot is unusually similar to other relevant voting activity after accounting for normal round consensus");
  if (currentStreak >= 3) reasons.push(`Recent support continues across ${currentStreak} consecutive editions`);
  if (countryStrengthRisk < 25 && pair.length >= 2) reasons.push("The target is broadly strong in the same voting fields, reducing the relationship-specific anomaly signal");
  if (networkRisk >= 65 && network?.reason) reasons.push(network.reason);

  if (effectiveRecentEditions < config.minimumEvidenceForStrongRisk) {
    warnings.push(`Recent-weighted evidence equals ${round(effectiveRecentEditions, 2)} editions; risk is capped until more independent evidence exists`);
  }
  if (baselineEffectiveEvidence < 1.5) warnings.push("Limited recent-weighted historical baseline; historical-deviation risk is conservative");
  if (!observedRankRows.length || baselineRankRows.length < 2) warnings.push("Insufficient rank history for rank-pattern analysis");
  if (!jury.length) warnings.push("No jury observations are available for this relationship");
  if (!televote.length) warnings.push("No televote observations are available for this relationship");

  return {
    overallRisk: Math.round(overallRisk),
    recentRisk: Math.round(recentRisk),
    lifetimeRisk: Math.round(lifetimeRisk),
    confidence: Math.round(confidence),
    juryRisk: Math.round(juryRisk),
    televoteRisk: Math.round(televoteRisk),
    crossChannelRisk: Math.round(crossChannelRisk),
    relationshipAnomaly: Math.round(relationshipAnomaly),
    reciprocityRisk: Math.round(reciprocityRisk),
    intensityRisk: Math.round(intensityRisk),
    historicalDeviationRisk: Math.round(historicalDeviationRisk),
    rankPatternRisk: Math.round(rankPatternRisk),
    networkRisk: Math.round(networkRisk),
    countryStrengthRisk: Math.round(countryStrengthRisk),
    similarityRisk: Math.round(similarityRisk),
    continuityRisk: Math.round(continuityRisk),
    reasons,
    warnings,
    sampleSize: {
      editions: editions.size,
      opportunities,
      juryOpportunities: jury.length,
      televoteOpportunities: televote.length,
      historicalBaseline: baseline.length,
      effectiveRecentEditions,
      effectiveLifetimeEditions,
    },
    evidence: {
      observedSupport: supported,
      eligibleSupport: opportunities,
      smoothedSupportRate,
      recentSupportRate,
      lifetimeSupportRate,
      averageScore: observedAverageRecent,
      expectedAverageScore: expectedAverageRecent,
      maximumScores: maximum,
      reciprocalEditions,
      reciprocalSupportEditions: Math.round(clamp01(reciprocalSupportRate) * reciprocalEditions),
      crossChannelEditions,
      historicalMaxScoreRate: historicalMaximumRate,
      observedRankPercentile,
      expectedRankPercentile,
      currentStreak,
      effectiveHistoricalEvidence: effectiveRecentEditions,
    },
    modelVersion: FRIEND_VOTING_MODEL_VERSION,
  };
}
