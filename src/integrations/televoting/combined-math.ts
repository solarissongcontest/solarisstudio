import { DEFAULT_RANK_EXPONENT } from "@/integrations/televoting/televote-math";

export const COMBINED_ENGINE_VERSION = "component-pool-v2";
export const WEIGHT_TOLERANCE = 1e-6;

export type CalculationMethod = "rank_weighted" | "rescaled" | "proportional" | "adjustment";
export type CorrectionScope = "source" | "final";
export type SourceInputMode = "raw_results" | "converted_points" | "activity_points" | "correction";

export type ComponentSourceInput = {
  id: string;
  name: string;
  type: string;
  inputMode?: SourceInputMode | null;
  percentageWeight: number;
  enabled: boolean;
  displayOrder: number;
  values: Record<string, number>;
  distributions?: Record<string, number[]>;
  correctionTargetSourceId?: string | null;
  correctionScope?: CorrectionScope;
};

export type TieBreakData = {
  rawTie: boolean;
  rankResolvedBy?: "raw_score" | "score_distribution" | "running_order" | "country_id";
  distributionUnavailable: boolean;
  distribution?: number[];
  remainderResolvedBy?: "remainder" | "raw_score" | "raw_rank" | "score_distribution" | "running_order" | "country_id";
};

export type ComponentPool = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  method: CalculationMethod;
  displayOrder: number;
  percentageWeight: number;
  exactPool: number;
  flooredPool: number;
  poolRemainder: number;
  poolBonus: 0 | 1;
  finalPool: number;
};

export type ComponentCountryResult = {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  countryCode: string;
  method: CalculationMethod;
  rawScore: number;
  rawRank: number | null;
  participantCount: number;
  rankBase: number | null;
  rankExponent: number | null;
  rankFactor: number | null;
  weightedScore: number | null;
  sourceWeightedTotal: number | null;
  sourceRawTotal: number;
  exactAllocation: number;
  flooredAllocation: number;
  decimalRemainder: number;
  remainderBonus: 0 | 1;
  finalAllocatedPoints: number;
  tieBreakData: TieBreakData;
};

export type CombinedCountryResult = {
  code: string;
  componentResults: ComponentCountryResult[];
  totalVotingPoints: number;
  totalActivityPoints: number;
  finalCorrection: number;
  finalCombinedPoints: number;
  finalRank: number;
  finalTieBreakData: {
    tied: boolean;
    resolvedBy?: string;
    decidingSourceId?: string | null;
    comparedValues?: Record<string, number>;
  };
};

export type CombinedResult = {
  pools: ComponentPool[];
  rows: CombinedCountryResult[];
  totalPoints: number;
  totalPercentage: number;
  allocatedTotal: number;
  finalTotal: number;
  corrections: Array<{
    sourceId: string;
    sourceName: string;
    scope: CorrectionScope;
    targetSourceId: string | null;
    values: Record<string, number>;
  }>;
  errors: string[];
  warnings: string[];
};

export function inputModeForSourceType(type: string): SourceInputMode {
  if (type === "activity") return "activity_points";
  if (type === "correction") return "correction";
  return "raw_results";
}

export function resolveInputMode(source: { inputMode?: SourceInputMode | null; type: string }): SourceInputMode {
  return source.inputMode ?? inputModeForSourceType(source.type);
}

export function methodForInputMode(mode: SourceInputMode): CalculationMethod {
  if (mode === "converted_points") return "rescaled";
  if (mode === "activity_points") return "proportional";
  if (mode === "correction") return "adjustment";
  return "rank_weighted";
}

export function labelForInputMode(mode: SourceInputMode) {
  if (mode === "raw_results") return "Raw results";
  if (mode === "converted_points") return "Converted points";
  if (mode === "activity_points") return "Activity points";
  return "Manual correction";
}

export type RemainderRow<T> = {
  item: T;
  exact: number;
  floored: number;
  remainder: number;
  bonus: 0 | 1;
  final: number;
};

export function largestRemainder<T>(
  items: T[],
  exactOf: (item: T) => number,
  total: number,
  tieBreak: (a: T, b: T) => number = () => 0,
): RemainderRow<T>[] {
  const rows = items.map((item) => {
    const exact = exactOf(item);
    const floored = Math.floor(exact + 1e-9);
    return { item, exact, floored, remainder: exact - floored, bonus: 0 as 0 | 1, final: floored };
  });
  const leftover = Math.round(total - rows.reduce((sum, row) => sum + row.floored, 0));
  if (leftover > 0) {
    const ordered = [...rows].sort((a, b) => b.remainder - a.remainder || tieBreak(a.item, b.item));
    for (let index = 0; index < leftover && index < ordered.length; index += 1) {
      ordered[index]!.bonus = 1;
      ordered[index]!.final = ordered[index]!.floored + 1;
    }
  }
  return rows;
}

export function compareDistributions(a?: number[], b?: number[]) {
  if (!a?.length || !b?.length) return 0;
  const A = [...a].sort((x, y) => y - x);
  const B = [...b].sort((x, y) => y - x);
  const length = Math.max(A.length, B.length);
  for (let index = 0; index < length; index += 1) {
    const av = A[index] ?? -Infinity;
    const bv = B[index] ?? -Infinity;
    if (av !== bv) return bv - av;
  }
  return 0;
}

function allocateRankWeightedSource(input: {
  source: { id: string; name: string; type: string };
  participants: string[];
  runningOrder: Record<string, number>;
  values: Record<string, number>;
  distributions?: Record<string, number[]>;
  pool: number;
  rankExponent: number;
}) {
  const { participants, values, distributions, pool, rankExponent, source } = input;
  const rankBase = participants.length + 2;
  const raw = (code: string) => Number(values[code] ?? 0);
  const rawTotal = participants.reduce((sum, code) => sum + raw(code), 0);
  const rankCompare = (a: string, b: string) =>
    raw(b) - raw(a) ||
    compareDistributions(distributions?.[a], distributions?.[b]) ||
    (input.runningOrder[a] ?? 0) - (input.runningOrder[b] ?? 0) ||
    a.localeCompare(b);
  const ordered = [...participants].sort(rankCompare);
  const rankOf = new Map(ordered.map((code, index) => [code, index + 1]));
  const weightedOf = (code: string) => {
    const rank = rankOf.get(code)!;
    const factor = Math.pow(rankBase - rank, rankExponent);
    return { factor, weighted: raw(code) * factor };
  };
  const totalWeighted = participants.reduce((sum, code) => sum + weightedOf(code).weighted, 0);
  const allocation = largestRemainder(
    participants,
    (code) => (totalWeighted > 0 ? (weightedOf(code).weighted / totalWeighted) * pool : 0),
    totalWeighted > 0 ? pool : 0,
    (a, b) => rankCompare(a, b),
  );

  const rows: ComponentCountryResult[] = allocation.map((row) => {
    const peers = participants.filter((code) => code !== row.item && raw(code) === raw(row.item));
    const distribution = distributions?.[row.item];
    const distributionResolved = peers.some((peer) => compareDistributions(distribution, distributions?.[peer]) !== 0);
    const { factor, weighted } = weightedOf(row.item);
    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.type,
      countryCode: row.item,
      method: "rank_weighted",
      rawScore: raw(row.item),
      rawRank: rankOf.get(row.item)!,
      participantCount: participants.length,
      rankBase,
      rankExponent,
      rankFactor: factor,
      weightedScore: weighted,
      sourceWeightedTotal: totalWeighted,
      sourceRawTotal: rawTotal,
      exactAllocation: row.exact,
      flooredAllocation: row.floored,
      decimalRemainder: row.remainder,
      remainderBonus: row.bonus,
      finalAllocatedPoints: row.final,
      tieBreakData: {
        rawTie: peers.length > 0,
        rankResolvedBy: peers.length
          ? distributionResolved
            ? "score_distribution"
            : input.runningOrder[row.item] !== undefined
              ? "running_order"
              : "country_id"
          : "raw_score",
        distributionUnavailable: peers.length > 0 && !distribution?.length,
        ...(distribution?.length ? { distribution: [...distribution].sort((a, b) => b - a) } : {}),
        remainderResolvedBy: row.bonus ? "remainder" : undefined,
      },
    };
  });
  return { rows, totalWeighted, rawTotal };
}

function allocateProportionalSource(input: {
  source: { id: string; name: string; type: string };
  participants: string[];
  runningOrder: Record<string, number>;
  values: Record<string, number>;
  pool: number;
  method: "proportional" | "rescaled";
  distributions?: Record<string, number[]>;
}) {
  const raw = (code: string) => Math.max(0, Number(input.values[code] ?? 0));
  const rawTotal = input.participants.reduce((sum, code) => sum + raw(code), 0);
  const ordered = [...input.participants].sort(
    (a, b) =>
      raw(b) - raw(a) ||
      compareDistributions(input.distributions?.[a], input.distributions?.[b]) ||
      (input.runningOrder[a] ?? 0) - (input.runningOrder[b] ?? 0) ||
      a.localeCompare(b),
  );
  const rankOf = new Map(ordered.map((code, index) => [code, index + 1]));
  const allocation = largestRemainder(
    input.participants,
    (code) => (rawTotal > 0 ? (raw(code) / rawTotal) * input.pool : 0),
    rawTotal > 0 ? input.pool : 0,
    (a, b) => raw(b) - raw(a) || (input.runningOrder[a] ?? 0) - (input.runningOrder[b] ?? 0) || a.localeCompare(b),
  );
  return {
    rawTotal,
    rows: allocation.map<ComponentCountryResult>((row) => ({
      sourceId: input.source.id,
      sourceName: input.source.name,
      sourceType: input.source.type,
      countryCode: row.item,
      method: input.method,
      rawScore: raw(row.item),
      rawRank: input.method === "rescaled" ? rankOf.get(row.item) ?? null : null,
      participantCount: input.participants.length,
      rankBase: null,
      rankExponent: null,
      rankFactor: null,
      weightedScore: null,
      sourceWeightedTotal: null,
      sourceRawTotal: rawTotal,
      exactAllocation: row.exact,
      flooredAllocation: row.floored,
      decimalRemainder: row.remainder,
      remainderBonus: row.bonus,
      finalAllocatedPoints: row.final,
      tieBreakData: { rawTie: false, distributionUnavailable: false },
    })),
  };
}

function allocateComponentPools(components: ComponentSourceInput[], totalPoints: number): ComponentPool[] {
  const total = Math.max(0, Math.trunc(totalPoints));
  return largestRemainder(
    components,
    (source) => (total * Number(source.percentageWeight || 0)) / 100,
    total,
    (a, b) => Number(b.percentageWeight) - Number(a.percentageWeight) || a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
  ).map((row) => ({
    sourceId: row.item.id,
    sourceName: row.item.name,
    sourceType: row.item.type,
    method: methodForInputMode(resolveInputMode(row.item)),
    displayOrder: row.item.displayOrder,
    percentageWeight: Number(row.item.percentageWeight || 0),
    exactPool: row.exact,
    flooredPool: row.floored,
    poolRemainder: row.remainder,
    poolBonus: row.bonus,
    finalPool: row.final,
  }));
}

export function computeCombined(options: {
  participants: string[];
  sources: ComponentSourceInput[];
  totalPoints: number;
  rankExponent?: number;
}): CombinedResult {
  const participants = [...options.participants];
  const rankExponent = Number(options.rankExponent ?? DEFAULT_RANK_EXPONENT);
  const totalPoints = Math.max(0, Math.trunc(options.totalPoints));
  const errors: string[] = [];
  const warnings: string[] = [];
  const runningOrder = Object.fromEntries(participants.map((code, index) => [code, index]));
  const eligible = new Set(participants);
  const enabled = options.sources.filter((source) => source.enabled);
  const corrections = enabled.filter((source) => resolveInputMode(source) === "correction");
  const components = enabled
    .filter((source) => resolveInputMode(source) !== "correction")
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));

  for (const source of enabled) {
    for (const [code, value] of Object.entries(source.values)) {
      if (!eligible.has(code) && Number(value) !== 0) warnings.push(`“${source.name}” contains ${code}, which is not eligible and was excluded.`);
    }
  }

  const adjustedValues = new Map(components.map((source) => [source.id, { ...source.values }]));
  const finalCorrections: Record<string, number> = {};
  for (const correction of corrections) {
    const scope = correction.correctionScope ?? "final";
    if (scope === "source") {
      const target = correction.correctionTargetSourceId;
      if (!target || !adjustedValues.has(target)) {
        errors.push(`Correction “${correction.name}” targets a source that does not exist.`);
        continue;
      }
      const bucket = adjustedValues.get(target)!;
      for (const code of participants) bucket[code] = Number(bucket[code] ?? 0) + Number(correction.values[code] ?? 0);
    } else {
      for (const code of participants) finalCorrections[code] = (finalCorrections[code] ?? 0) + Number(correction.values[code] ?? 0);
    }
  }

  const totalPercentage = components.reduce((sum, source) => sum + Number(source.percentageWeight || 0), 0);
  if (!components.length) errors.push("Enable at least one component source.");
  if (!participants.length) errors.push("Select at least one eligible entry.");
  if (components.length && Math.abs(totalPercentage - 100) > WEIGHT_TOLERANCE * 100) {
    errors.push(`Enabled component weights total ${Math.round(totalPercentage * 10000) / 10000}% — they must total exactly 100%.`);
  }

  const pools = allocateComponentPools(components, totalPoints);
  const poolById = new Map(pools.map((pool) => [pool.sourceId, pool]));
  const componentRows: ComponentCountryResult[] = [];

  for (const source of components) {
    const pool = poolById.get(source.id)!;
    const values = adjustedValues.get(source.id)!;
    const method = methodForInputMode(resolveInputMode(source));
    if (method === "proportional" || method === "rescaled") {
      const result = allocateProportionalSource({
        source: { id: source.id, name: source.name, type: source.type },
        participants,
        runningOrder,
        values,
        pool: pool.finalPool,
        method,
        distributions: source.distributions,
      });
      if (result.rawTotal <= 0 && pool.finalPool > 0) errors.push(`“${source.name}” has no source values.`);
      componentRows.push(...result.rows);
    } else {
      const result = allocateRankWeightedSource({
        source: { id: source.id, name: source.name, type: source.type },
        participants,
        runningOrder,
        values,
        distributions: source.distributions,
        pool: pool.finalPool,
        rankExponent,
      });
      if (result.totalWeighted <= 0 && pool.finalPool > 0) errors.push(`“${source.name}” has no scores.`);
      if (result.rows.some((row) => row.tieBreakData.distributionUnavailable)) warnings.push(`“${source.name}” has tied raw scores without score-distribution evidence; running order was used.`);
      componentRows.push(...result.rows);
    }
    const allocated = componentRows.filter((row) => row.sourceId === source.id).reduce((sum, row) => sum + row.finalAllocatedPoints, 0);
    if (allocated !== pool.finalPool && pool.finalPool > 0 && allocated !== 0) errors.push(`“${source.name}” allocated ${allocated} points but its pool is ${pool.finalPool}.`);
  }

  const byCountry = new Map(participants.map((code) => [code, [] as ComponentCountryResult[]]));
  for (const row of componentRows) byCountry.get(row.countryCode)?.push(row);
  const votingPools = pools
    .filter((pool) => pool.method === "rank_weighted" || pool.method === "rescaled")
    .sort((a, b) => b.percentageWeight - a.percentageWeight || a.displayOrder - b.displayOrder);

  const rows: CombinedCountryResult[] = participants.map((code) => {
    const componentResults = byCountry.get(code) ?? [];
    const totalVotingPoints = componentResults
      .filter((row) => row.method === "rank_weighted" || row.method === "rescaled")
      .reduce((sum, row) => sum + row.finalAllocatedPoints, 0);
    const totalActivityPoints = componentResults
      .filter((row) => row.method === "proportional")
      .reduce((sum, row) => sum + row.finalAllocatedPoints, 0);
    const finalCorrection = Number(finalCorrections[code] ?? 0);
    return {
      code,
      componentResults,
      totalVotingPoints,
      totalActivityPoints,
      finalCorrection,
      finalCombinedPoints: Math.max(0, totalVotingPoints + totalActivityPoints + finalCorrection),
      finalRank: 0,
      finalTieBreakData: { tied: false },
    };
  });

  const alloc = (row: CombinedCountryResult, sourceId: string) => row.componentResults.find((item) => item.sourceId === sourceId)?.finalAllocatedPoints ?? 0;
  const raw = (row: CombinedCountryResult, sourceId: string) => row.componentResults.find((item) => item.sourceId === sourceId)?.rawScore ?? 0;
  const dist = (row: CombinedCountryResult, sourceId: string) => row.componentResults.find((item) => item.sourceId === sourceId)?.tieBreakData.distribution;
  const steps = [
    ...votingPools.map((pool) => ({ label: `allocated points in ${pool.sourceName}`, sourceId: pool.sourceId, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => alloc(b, pool.sourceId) - alloc(a, pool.sourceId) })),
    { label: "total voting points", sourceId: null, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => b.totalVotingPoints - a.totalVotingPoints },
    { label: "activity points", sourceId: null, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => b.totalActivityPoints - a.totalActivityPoints },
    ...votingPools.map((pool) => ({ label: `raw score in ${pool.sourceName}`, sourceId: pool.sourceId, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => raw(b, pool.sourceId) - raw(a, pool.sourceId) })),
    ...votingPools.map((pool) => ({ label: `score distribution in ${pool.sourceName}`, sourceId: pool.sourceId, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => compareDistributions(dist(a, pool.sourceId), dist(b, pool.sourceId)) })),
    { label: "running order", sourceId: null, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => (runningOrder[a.code] ?? 0) - (runningOrder[b.code] ?? 0) },
    { label: "entry key", sourceId: null, compare: (a: CombinedCountryResult, b: CombinedCountryResult) => a.code.localeCompare(b.code) },
  ];

  rows.sort((a, b) => {
    const points = b.finalCombinedPoints - a.finalCombinedPoints;
    if (points) return points;
    for (const step of steps) {
      const diff = step.compare(a, b);
      if (diff) {
        a.finalTieBreakData = { tied: true, resolvedBy: step.label, decidingSourceId: step.sourceId };
        b.finalTieBreakData = { tied: true, resolvedBy: step.label, decidingSourceId: step.sourceId };
        return diff;
      }
    }
    return 0;
  });
  rows.forEach((row, index) => { row.finalRank = index + 1; });

  const allocatedTotal = componentRows.reduce((sum, row) => sum + row.finalAllocatedPoints, 0);
  const finalTotal = rows.reduce((sum, row) => sum + row.finalCombinedPoints, 0);
  const correctionTotal = rows.reduce((sum, row) => sum + row.finalCorrection, 0);
  if (!errors.length && allocatedTotal !== totalPoints) errors.push(`Allocated component points total ${allocatedTotal} but the overall pool is ${totalPoints}.`);
  if (!errors.length && correctionTotal === 0 && finalTotal !== totalPoints) errors.push(`Final totals add up to ${finalTotal} but the overall pool is ${totalPoints}.`);

  return {
    pools,
    rows,
    totalPoints,
    totalPercentage,
    allocatedTotal,
    finalTotal,
    corrections: corrections.map((source) => ({
      sourceId: source.id,
      sourceName: source.name,
      scope: source.correctionScope ?? "final",
      targetSourceId: source.correctionTargetSourceId ?? null,
      values: source.values,
    })),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
