/** Pure, explainable friend-voting model v3. Statistical signals are for review, never guilt findings. */
export const FRIEND_VOTING_MODEL_VERSION = "friend-voting-model-v3";

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
  rankPatternWeight?: number;
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
  countryStrengthWeight: 10,
  rankPatternWeight: 10,
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
  rankPatternRisk: number;
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
    observedRankPercentile: number;
    expectedRankPercentile: number;
  };
  modelVersion: string;
};

type Aggregate = { total: number; count: number };
type FieldAggregate = Aggregate & { byVoter: Map<string, Aggregate> };
type PreparedHistory = {
  all: AdvancedFriendVotingObservation[];
  byVoter: Map<string, AdvancedFriendVotingObservation[]>;
  byVoterTarget: Map<string, AdvancedFriendVotingObservation[]>;
  intensityByVoter: Map<string, Aggregate>;
  fieldIntensity: Map<string, FieldAggregate>;
};

const preparedHistoryCache = new WeakMap<AdvancedFriendVotingObservation[], PreparedHistory>();
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
  const usable = parts.filter(([, w]) => w > 0 && Number.isFinite(w));
  const total = usable.reduce((s, [, w]) => s + w, 0);
  return total ? usable.reduce((s, [v, w]) => s + clamp(v) * w, 0) / total : 0;
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
  const intensityByVoter = new Map<string, Aggregate>();
  const fieldIntensity = new Map<string, FieldAggregate>();

  for (const row of all) {
    addToMapList(byVoter, row.voterId, row);
    addToMapList(byVoterTarget, `${row.voterId}\u0000${row.targetCode}`, row);

    if (row.maxScore > 0) {
      const normalized = clamp01(row.score / row.maxScore);
      const voterAggregate = intensityByVoter.get(row.voterId) ?? { total: 0, count: 0 };
      voterAggregate.total += normalized;
      voterAggregate.count += 1;
      intensityByVoter.set(row.voterId, voterAggregate);

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

  const prepared = { all, byVoter, byVoterTarget, intensityByVoter, fieldIntensity };
  preparedHistoryCache.set(allObservations, prepared);
  return prepared;
}

export function calculateAdvancedFriendVotingRisk(
  pairObservations: AdvancedFriendVotingObservation[],
  allObservations: AdvancedFriendVotingObservation[],
  reciprocalSupportRate = 0,
  reciprocalEditions = 0,
  network: AdvancedFriendVotingNetworkSignal | null = null,
  config: AdvancedFriendVotingConfig = DEFAULT_ADVANCED_FRIEND_VOTING_CONFIG,
): AdvancedFriendVotingResult {
  const pair = dedupe(pairObservations, true);
  const history = prepareHistory(allObservations);
  const editions = new Set(pair.map((r) => r.editionId));
  const jury = pair.filter((r) => r.channel === "jury");
  const televote = pair.filter((r) => r.channel === "televote");
  const supported = pair.filter((r) => r.supported ?? r.score > 0).length;
  const maximum = pair.filter((r) => r.maximum ?? (r.score > 0 && r.score === r.maxScore)).length;
  const opportunities = pair.length;
  const voterId = pair[0]?.voterId ?? "";
  const targetCode = pair[0]?.targetCode ?? "";

  const targetRows = history.byVoterTarget.get(`${voterId}\u0000${targetCode}`) ?? [];
  const targetHistory = targetRows.filter((r) => !editions.has(r.editionId));
  const voterRows = history.byVoter.get(voterId) ?? [];
  const voterHistory = voterRows.filter((r) => r.targetCode !== targetCode);
  const baseline = targetHistory.length ? targetHistory : voterHistory;

  const baselineScores = baseline.map((r) => Number(r.score) || 0);
  const observedAverage = mean(pair.map((r) => Number(r.score) || 0));
  const expectedAverage = baselineScores.length ? mean(baselineScores) : 0;
  const historicalDeviationRisk = baselineScores.length >= 2 && expectedAverage !== 0
    ? zRisk(Math.abs(observedAverage - expectedAverage) / Math.max(sd(baselineScores), 1))
    : 0;

  const voterIntensityAggregate = history.intensityByVoter.get(voterId);
  const expectedIntensity = voterIntensityAggregate?.count
    ? voterIntensityAggregate.total / voterIntensityAggregate.count
    : 0;
  const pairIntensity = pair.filter((r) => r.maxScore > 0).map((r) => clamp01(r.score / r.maxScore));
  const observedIntensity = mean(pairIntensity);
  const maximumRate = opportunities ? maximum / opportunities : 0;
  const historicalMaximumRate = baseline.length
    ? baseline.filter((r) => r.maxScore > 0 && r.score === r.maxScore && r.score > 0).length / baseline.length
    : 0;
  const intensityRisk = clamp(100 * (
    0.55 * clamp01(Math.abs(observedIntensity - expectedIntensity) / Math.max(0.08, expectedIntensity || 0.08))
    + 0.45 * Math.abs(maximumRate - historicalMaximumRate)
  ));

  const smoothedSupportRate = beta(supported, opportunities, config.bayesianPriorAlpha, config.bayesianPriorBeta);
  const relationshipAnomaly = clamp(100 * (
    0.5 * smoothedSupportRate * Math.min(1, opportunities / 8)
    + 0.3 * clamp01(Math.abs(observedAverage - expectedAverage) / 12)
    + 0.2 * maximumRate
  ));

  const jurySupported = jury.filter((r) => r.supported ?? r.score > 0).length;
  const televoteSupported = televote.filter((r) => r.supported ?? r.score > 0).length;
  const juryRisk = jury.length
    ? weighted([
        [100 * beta(jurySupported, jury.length, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, jury.length / 8), 0.65],
        [historicalDeviationRisk, 0.35],
      ])
    : 0;
  const televoteRisk = televote.length
    ? weighted([
        [100 * beta(televoteSupported, televote.length, config.bayesianPriorAlpha, config.bayesianPriorBeta) * Math.min(1, televote.length / 8), 0.65],
        [historicalDeviationRisk, 0.35],
      ])
    : 0;

  const channelsByEdition = new Map<string, Set<string>>();
  for (const row of pair) {
    if (!(row.supported ?? row.score > 0)) continue;
    const channels = channelsByEdition.get(row.editionId) ?? new Set<string>();
    channels.add(row.channel);
    channelsByEdition.set(row.editionId, channels);
  }
  const crossChannelEditions = [...channelsByEdition.values()].filter((channels) => channels.has("jury") && channels.has("televote")).length;
  const crossChannelRisk = clamp(100 * (editions.size ? crossChannelEditions / editions.size : 0) * Math.min(1, editions.size / 6));
  const reciprocityRisk = clamp(100 * beta(
    reciprocalSupportRate * reciprocalEditions,
    reciprocalEditions,
    config.bayesianPriorAlpha,
    config.bayesianPriorBeta,
  ) * Math.min(1, reciprocalEditions / 6));
  const networkRisk = clamp(network?.score ?? 0);

  const residuals: number[] = [];
  for (const row of pair) {
    if (row.maxScore <= 0) continue;
    const field = history.fieldIntensity.get(`${row.editionId}:${row.channel}:${row.targetCode}`);
    if (!field) continue;
    const own = field.byVoter.get(row.voterId) ?? { total: 0, count: 0 };
    const othersCount = field.count - own.count;
    if (othersCount <= 0) continue;
    const fieldAverage = (field.total - own.total) / othersCount;
    residuals.push(Math.abs(clamp01(row.score / row.maxScore) - fieldAverage));
  }
  const countryStrengthRisk = clamp(100 * mean(residuals) * Math.min(1, residuals.length / 4));

  const observedRankValues = pair.map(rankPercentile).filter((value): value is number => value != null);
  const baselineRankValues = baseline.map(rankPercentile).filter((value): value is number => value != null);
  const observedRankPercentile = mean(observedRankValues);
  const expectedRankPercentile = mean(baselineRankValues);
  const positiveRankShift = Math.max(0, observedRankPercentile - expectedRankPercentile);
  const rankZ = baselineRankValues.length >= 2
    ? positiveRankShift / Math.max(sd(baselineRankValues), 0.12)
    : 0;
  const topQuartileRate = observedRankValues.length
    ? observedRankValues.filter((value) => value >= 0.75).length / observedRankValues.length
    : 0;
  const historicalTopQuartileRate = baselineRankValues.length
    ? baselineRankValues.filter((value) => value >= 0.75).length / baselineRankValues.length
    : 0;
  const rankPatternRisk = observedRankValues.length && baselineRankValues.length >= 2
    ? clamp(0.7 * zRisk(rankZ) + 30 * Math.max(0, topQuartileRate - historicalTopQuartileRate))
    : 0;

  const baseRisk = weighted([
    [relationshipAnomaly, config.relationshipAnomalyWeight],
    [historicalDeviationRisk, config.historicalDeviationWeight],
    [reciprocityRisk, config.reciprocityWeight],
    [intensityRisk, config.intensityWeight],
    [juryRisk, config.juryWeight],
    [televoteRisk, config.televoteWeight],
    [crossChannelRisk, config.crossChannelWeight],
    [rankPatternRisk, config.rankPatternWeight ?? 10],
    [networkRisk, config.networkWeight],
  ]);
  let overallRisk = clamp(baseRisk + (countryStrengthRisk - 50) * Math.min(1, config.countryStrengthWeight / 100));
  if (editions.size < 2) overallRisk = Math.min(overallRisk, config.oneEditionCap);
  else if (editions.size < 3) overallRisk = Math.min(overallRisk, config.twoEditionCap);

  const evidenceFactor = 1 - Math.exp(-opportunities / 5);
  const editionFactor = 1 - Math.exp(-editions.size / 3);
  const baselineFactor = Math.min(1, baseline.length / 8);
  const consistency = pairIntensity.length > 1 ? 1 - clamp01(sd(pairIntensity) / 0.5) : 0.5;
  const channelFactor = pair.length ? 0.75 + 0.25 * Math.min(1, new Set(pair.map((r) => r.channel)).size / 2) : 0;
  const confidence = clamp(100 * (
    0.35 * evidenceFactor
    + 0.35 * editionFactor
    + 0.2 * baselineFactor
    + 0.1 * consistency
  ) * channelFactor);

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (supported && smoothedSupportRate >= 0.7 && editions.size >= 2) {
    reasons.push(`Repeated support in ${pct(supported / Math.max(1, opportunities))} of eligible observations (${supported}/${opportunities})`);
  }
  if (baseline.length >= 2 && historicalDeviationRisk >= 60) {
    reasons.push(`Observed average score (${round(observedAverage, 1)}) differs unusually from the historical baseline (${round(expectedAverage, 1)})`);
  }
  if (rankPatternRisk >= 60) {
    reasons.push(`The target is ranked unusually high compared with this voter's historical rank pattern`);
  }
  if (maximumRate >= 0.4 && editions.size >= 2) {
    reasons.push(`Maximum-score concentration is ${pct(maximumRate)}, versus ${pct(historicalMaximumRate)} in the available baseline`);
  }
  if (reciprocalEditions && reciprocalSupportRate >= 0.6) {
    reasons.push(`Reciprocal support occurred in ${pct(reciprocalSupportRate)} of comparable editions`);
  }
  if (crossChannelEditions) {
    reasons.push(`The relationship appears in both jury and televote in ${crossChannelEditions} edition${crossChannelEditions === 1 ? "" : "s"}`);
  }
  if (countryStrengthRisk < 25 && pair.length >= 2) {
    reasons.push("The target is broadly strong in the same voting fields, reducing the relationship-specific anomaly signal");
  }
  if (networkRisk >= 65 && network?.reason) reasons.push(network.reason);

  if (editions.size < config.minimumEvidenceForStrongRisk) {
    warnings.push(`Only ${editions.size} independent edition${editions.size === 1 ? "" : "s"} are available; risk is capped and should not be treated as a strong conclusion`);
  }
  if (baseline.length < 2) warnings.push("Insufficient target-specific historical baseline; historical-deviation risk is conservative");
  if (!observedRankValues.length || baselineRankValues.length < 2) warnings.push("Insufficient rank history for rank-pattern analysis");
  if (!jury.length) warnings.push("No jury observations are available for this relationship");
  if (!televote.length) warnings.push("No televote observations are available for this relationship");

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
    rankPatternRisk: Math.round(rankPatternRisk),
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
      observedRankPercentile,
      expectedRankPercentile,
    },
    modelVersion: FRIEND_VOTING_MODEL_VERSION,
  };
}
