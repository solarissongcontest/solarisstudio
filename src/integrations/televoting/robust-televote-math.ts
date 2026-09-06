export const ROBUST_TELEVOTE_ENGINE_VERSION = "robust-televote-v2";

export type RobustTelevoteConfig = {
  ballotTotal: number;
  ballotExponent: number;
  breadthFloor: number;
  breadthExponent: number;
  supportExponent: number;
  rankBoostStrength: number;
  rankBoostShape: number;
};

export const DEFAULT_ROBUST_TELEVOTE_CONFIG: RobustTelevoteConfig = {
  ballotTotal: 20,
  ballotExponent: 0.75,
  breadthFloor: 0.75,
  breadthExponent: 0.5,
  supportExponent: 1.2,
  rankBoostStrength: 0.8,
  rankBoostShape: 1.3,
};

export type RobustBallotInput = {
  voterId: string;
  allocations: Record<string, number>;
};

export type EffectiveBallot = {
  voterId: string;
  originalTotal: number;
  effectiveTotal: number;
  allocations: Record<string, number>;
};

export type RobustTelevoteRow = {
  code: string;
  rawPoints: number;
  effectivePoints: number;
  supporterCount: number;
  effectiveSupporters: number;
  breadthRatio: number;
  breadthFactor: number;
  robustSupport: number;
  robustRank: number;
  rankPercentile: number;
  rankBoost: number;
  weightedScore: number;
  exactPoints: number;
  flooredPoints: number;
  decimalRemainder: number;
  remainderBonus: 0 | 1;
  finalPoints: number;
};

export type RobustTelevoteResult = {
  engineVersion: typeof ROBUST_TELEVOTE_ENGINE_VERSION;
  config: RobustTelevoteConfig;
  participantCount: number;
  voterCount: number;
  totalPoints: number;
  totalWeighted: number;
  distributedTotal: number;
  zeroWeight: boolean;
  effectiveBallots: EffectiveBallot[];
  rows: RobustTelevoteRow[];
};

const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function resolveRobustTelevoteConfig(
  input: Partial<RobustTelevoteConfig> | null | undefined,
): RobustTelevoteConfig {
  const config = { ...DEFAULT_ROBUST_TELEVOTE_CONFIG, ...(input ?? {}) };
  return {
    ballotTotal: Math.max(0, Number(config.ballotTotal) || DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotTotal),
    ballotExponent: clamp(Number(config.ballotExponent), 0.1, 2),
    breadthFloor: clamp(Number(config.breadthFloor), 0, 1),
    breadthExponent: clamp(Number(config.breadthExponent), 0.1, 2),
    supportExponent: clamp(Number(config.supportExponent), 0.1, 3),
    rankBoostStrength: clamp(Number(config.rankBoostStrength), 0, 3),
    rankBoostShape: clamp(Number(config.rankBoostShape), 0.1, 4),
  };
}

export function transformBallot(
  ballot: RobustBallotInput,
  participants: string[],
  configInput?: Partial<RobustTelevoteConfig> | null,
): EffectiveBallot {
  const config = resolveRobustTelevoteConfig(configInput);
  const allocations = Object.fromEntries(participants.map((code) => [code, 0])) as Record<string, number>;
  const original = participants.map((code) => Math.max(0, Number(ballot.allocations[code] ?? 0)));
  const originalTotal = original.reduce((sum, value) => sum + value, 0);
  if (originalTotal <= 0 || config.ballotTotal <= 0) {
    return { voterId: ballot.voterId, originalTotal, effectiveTotal: 0, allocations };
  }

  const softened = original.map((value) => (value > 0 ? Math.pow(value, config.ballotExponent) : 0));
  const softenedTotal = softened.reduce((sum, value) => sum + value, 0);
  if (softenedTotal <= 0) {
    return { voterId: ballot.voterId, originalTotal, effectiveTotal: 0, allocations };
  }

  participants.forEach((code, index) => {
    allocations[code] = (softened[index]! / softenedTotal) * config.ballotTotal;
  });

  return {
    voterId: ballot.voterId,
    originalTotal,
    effectiveTotal: Object.values(allocations).reduce((sum, value) => sum + value, 0),
    allocations,
  };
}

export function effectiveSupporterCount(contributions: number[]) {
  const nonNegative = contributions.map((value) => Math.max(0, Number(value) || 0));
  const total = nonNegative.reduce((sum, value) => sum + value, 0);
  const squareTotal = nonNegative.reduce((sum, value) => sum + value * value, 0);
  return total > 0 && squareTotal > 0 ? (total * total) / squareTotal : 0;
}

export function breadthFactor(
  effectiveSupporters: number,
  voterCount: number,
  configInput?: Partial<RobustTelevoteConfig> | null,
) {
  const config = resolveRobustTelevoteConfig(configInput);
  if (voterCount <= 0 || effectiveSupporters <= 0) return config.breadthFloor;
  const breadthRatio = clamp(effectiveSupporters / voterCount, 0, 1);
  return config.breadthFloor + (1 - config.breadthFloor) * Math.pow(breadthRatio, config.breadthExponent);
}

function allocationCount(ballots: RobustBallotInput[], code: string, points: number) {
  return ballots.reduce(
    (count, ballot) => count + (Math.abs(Number(ballot.allocations[code] ?? 0) - points) < EPSILON ? 1 : 0),
    0,
  );
}

function compareDescending(a: number, b: number) {
  const delta = b - a;
  return Math.abs(delta) <= EPSILON ? 0 : delta;
}

export function convertRobustRound(options: {
  participants: string[];
  ballots: RobustBallotInput[];
  totalPoints: number;
  config?: Partial<RobustTelevoteConfig> | null;
}): RobustTelevoteResult {
  const participants = [...new Set(options.participants)];
  const eligible = new Set(participants);
  const ballots = options.ballots.map((ballot, index) => ({
    voterId: ballot.voterId || `voter-${index + 1}`,
    allocations: Object.fromEntries(
      Object.entries(ballot.allocations)
        .filter(([code]) => eligible.has(code))
        .map(([code, value]) => [code, Math.max(0, Number(value) || 0)]),
    ),
  }));
  const config = resolveRobustTelevoteConfig(options.config);
  const totalPoints = Math.max(0, Math.trunc(Number(options.totalPoints) || 0));
  const effectiveBallots = ballots.map((ballot) => transformBallot(ballot, participants, config));
  const voterCount = effectiveBallots.filter((ballot) => ballot.effectiveTotal > 0).length;

  const base = participants.map((code) => {
    const rawPoints = ballots.reduce((sum, ballot) => sum + Math.max(0, Number(ballot.allocations[code] ?? 0)), 0);
    const contributions = effectiveBallots.map((ballot) => Math.max(0, Number(ballot.allocations[code] ?? 0)));
    const effectivePoints = contributions.reduce((sum, value) => sum + value, 0);
    const supporterCount = contributions.filter((value) => value > EPSILON).length;
    const effectiveSupporters = effectiveSupporterCount(contributions);
    const breadthRatio = voterCount > 0 ? clamp(effectiveSupporters / voterCount, 0, 1) : 0;
    const factor = breadthFactor(effectiveSupporters, voterCount, config);
    return {
      code,
      rawPoints,
      effectivePoints,
      supporterCount,
      effectiveSupporters,
      breadthRatio,
      breadthFactor: factor,
      robustSupport: effectivePoints * factor,
    };
  });

  const baseByCode = new Map(base.map((row) => [row.code, row]));
  const rankCompare = (a: string, b: string) => {
    const A = baseByCode.get(a)!;
    const B = baseByCode.get(b)!;
    let comparison = compareDescending(A.robustSupport, B.robustSupport);
    if (comparison) return comparison;
    comparison = compareDescending(A.effectiveSupporters, B.effectiveSupporters);
    if (comparison) return comparison;
    comparison = B.supporterCount - A.supporterCount;
    if (comparison) return comparison;
    comparison = compareDescending(A.rawPoints, B.rawPoints);
    if (comparison) return comparison;
    for (let points = 10; points >= 1; points -= 1) {
      comparison = allocationCount(ballots, b, points) - allocationCount(ballots, a, points);
      if (comparison) return comparison;
    }
    return a.localeCompare(b);
  };

  const ordered = [...participants].sort(rankCompare);
  const rankOf = new Map(ordered.map((code, index) => [code, index + 1]));
  const n = participants.length;

  const enriched = base.map((row) => {
    const robustRank = rankOf.get(row.code) ?? n;
    const rankPercentile = n <= 1 ? 1 : clamp(1 - (robustRank - 1) / (n - 1), 0, 1);
    const rankBoost = 1 + config.rankBoostStrength * Math.pow(rankPercentile, config.rankBoostShape);
    const weightedScore = row.robustSupport > 0
      ? Math.pow(row.robustSupport, config.supportExponent) * rankBoost
      : 0;
    return { ...row, robustRank, rankPercentile, rankBoost, weightedScore };
  });

  const totalWeighted = enriched.reduce((sum, row) => sum + row.weightedScore, 0);
  const zeroWeight = totalWeighted <= 0;
  const allocations = enriched.map((row) => {
    const exactPoints = zeroWeight ? 0 : (row.weightedScore / totalWeighted) * totalPoints;
    const flooredPoints = Math.floor(exactPoints + EPSILON);
    return {
      row,
      exactPoints,
      flooredPoints,
      decimalRemainder: exactPoints - flooredPoints,
      remainderBonus: 0 as 0 | 1,
    };
  });

  if (!zeroWeight) {
    const flooredTotal = allocations.reduce((sum, row) => sum + row.flooredPoints, 0);
    const leftover = Math.max(0, totalPoints - flooredTotal);
    const remainderOrder = [...allocations].sort(
      (a, b) =>
        compareDescending(a.decimalRemainder, b.decimalRemainder) ||
        a.row.robustRank - b.row.robustRank ||
        a.row.code.localeCompare(b.row.code),
    );
    for (let index = 0; index < leftover && index < remainderOrder.length; index += 1) {
      remainderOrder[index]!.remainderBonus = 1;
    }
  }

  const rows = allocations
    .map<RobustTelevoteRow>((allocation) => ({
      ...allocation.row,
      exactPoints: allocation.exactPoints,
      flooredPoints: allocation.flooredPoints,
      decimalRemainder: allocation.decimalRemainder,
      remainderBonus: allocation.remainderBonus,
      finalPoints: allocation.flooredPoints + allocation.remainderBonus,
    }))
    .sort(
      (a, b) =>
        b.finalPoints - a.finalPoints ||
        a.robustRank - b.robustRank ||
        a.code.localeCompare(b.code),
    );

  return {
    engineVersion: ROBUST_TELEVOTE_ENGINE_VERSION,
    config,
    participantCount: participants.length,
    voterCount,
    totalPoints,
    totalWeighted,
    distributedTotal: rows.reduce((sum, row) => sum + row.finalPoints, 0),
    zeroWeight,
    effectiveBallots,
    rows,
  };
}
