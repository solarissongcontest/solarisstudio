export const DEFAULT_RANK_EXPONENT = 1.33;
export const CALC_ENGINE_VERSION = "rank-weighted-v1";

export type ConversionInput = {
  code: string;
  originalVotes: number;
  originalVoters?: number;
};

export type ConversionRow = {
  code: string;
  originalVotes: number;
  originalVoters: number;
  originalRank: number;
  originalShare: number;
  participantCount: number;
  rankBase: number;
  rankExponent: number;
  rankFactor: number;
  weightedScore: number;
  exactPoints: number;
  flooredPoints: number;
  decimalRemainder: number;
  remainderBonus: number;
  finalPoints: number;
};

export type ConversionResult = {
  rows: ConversionRow[];
  participantCount: number;
  rankBase: number;
  rankExponent: number;
  totalPoints: number;
  totalOriginalVotes: number;
  totalWeighted: number;
  leftover: number;
  distributedTotal: number;
  zeroWeight: boolean;
};

export function rankParticipants(items: ConversionInput[]) {
  return [...items].sort(
    (a, b) =>
      b.originalVotes - a.originalVotes ||
      (b.originalVoters ?? 0) - (a.originalVoters ?? 0) ||
      a.code.localeCompare(b.code),
  );
}

export function convertRound(
  items: ConversionInput[],
  totalPoints: number,
  rankExponent: number = DEFAULT_RANK_EXPONENT,
): ConversionResult {
  const n = items.length;
  const rankBase = n + 2;
  const T = Math.max(0, Math.trunc(totalPoints));
  const ordered = rankParticipants(items);
  const totalOriginalVotes = ordered.reduce((a, b) => a + b.originalVotes, 0);

  const base = ordered.map((item, idx) => {
    const originalRank = idx + 1;
    const rankFactor = Math.pow(rankBase - originalRank, rankExponent);
    const weightedScore = item.originalVotes * rankFactor;
    return {
      code: item.code,
      originalVotes: item.originalVotes,
      originalVoters: item.originalVoters ?? 0,
      originalRank,
      originalShare: totalOriginalVotes > 0 ? item.originalVotes / totalOriginalVotes : 0,
      participantCount: n,
      rankBase,
      rankExponent,
      rankFactor,
      weightedScore,
    };
  });

  const totalWeighted = base.reduce((a, b) => a + b.weightedScore, 0);
  const zeroWeight = totalWeighted <= 0;

  const rows: ConversionRow[] = base.map((row) => {
    const exactPoints = zeroWeight ? 0 : (row.weightedScore / totalWeighted) * T;
    const flooredPoints = Math.floor(exactPoints);
    return {
      ...row,
      exactPoints,
      flooredPoints,
      decimalRemainder: exactPoints - flooredPoints,
      remainderBonus: 0,
      finalPoints: flooredPoints,
    };
  });

  let leftover = 0;
  if (!zeroWeight) {
    const flooredSum = rows.reduce((a, b) => a + b.flooredPoints, 0);
    leftover = T - flooredSum;

    const order = [...rows].sort(
      (a, b) =>
        b.decimalRemainder - a.decimalRemainder ||
        b.originalVotes - a.originalVotes ||
        a.originalRank - b.originalRank ||
        a.code.localeCompare(b.code),
    );

    for (let index = 0; index < leftover && index < order.length; index += 1) {
      order[index]!.remainderBonus = 1;
    }
    for (const row of rows) row.finalPoints = row.flooredPoints + row.remainderBonus;
  }

  rows.sort(
    (a, b) =>
      b.finalPoints - a.finalPoints ||
      a.originalRank - b.originalRank ||
      a.code.localeCompare(b.code),
  );

  return {
    rows,
    participantCount: n,
    rankBase,
    rankExponent,
    totalPoints: T,
    totalOriginalVotes,
    totalWeighted,
    leftover,
    distributedTotal: rows.reduce((a, b) => a + b.finalPoints, 0),
    zeroWeight,
  };
}

export function formulaPreview(n: number, exponent = DEFAULT_RANK_EXPONENT) {
  return `P_i × (${n + 2} − r_i)^${exponent}`;
}
