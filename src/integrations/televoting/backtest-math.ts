import { analyseRobustInfluence } from "@/integrations/televoting/influence-math";
import {
  convertRobustRound,
  type RobustBallotInput,
  type RobustTelevoteConfig,
  type RobustTelevoteResult,
} from "@/integrations/televoting/robust-televote-math";
import { convertRound, type ConversionResult } from "@/integrations/televoting/televote-math";

export type EngineBacktestSummary = {
  winner: string | null;
  topThree: string[];
  winnerPoints: number;
  winnerMargin: number;
  topShare: number;
  zeroPointEntries: number;
  maxSingleVoterPointMovement: number;
  winnerSensitiveVoters: number;
};

export type AttackBacktest = {
  attackers: number;
  target: string;
  legacyRankBefore: number;
  legacyRankAfter: number;
  legacyPointGain: number;
  robustRankBefore: number;
  robustRankAfter: number;
  robustPointGain: number;
};

export type RoundBacktest = {
  legacy: EngineBacktestSummary;
  robust: EngineBacktestSummary;
  winnerChangedBetweenEngines: boolean;
  topThreeChangedBetweenEngines: boolean;
  attacks: AttackBacktest[];
};

function rawTotals(participants: string[], ballots: RobustBallotInput[]) {
  const totals = new Map(participants.map((code) => [code, { points: 0, voters: 0 }]));
  for (const ballot of ballots) {
    for (const code of participants) {
      const points = Math.max(0, Number(ballot.allocations[code] ?? 0));
      const bucket = totals.get(code)!;
      bucket.points += points;
      if (points > 0) bucket.voters += 1;
    }
  }
  return participants.map((code) => ({
    code,
    originalVotes: totals.get(code)!.points,
    originalVoters: totals.get(code)!.voters,
  }));
}

function resultRank(rows: Array<{ code: string }>) {
  return new Map(rows.map((row, index) => [row.code, index + 1]));
}

function resultPoints(rows: Array<{ code: string; finalPoints: number }>) {
  return new Map(rows.map((row) => [row.code, row.finalPoints]));
}

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const B = new Set(b);
  return a.every((value) => B.has(value));
}

function legacyInfluence(options: {
  participants: string[];
  ballots: RobustBallotInput[];
  totalPoints: number;
  rankExponent: number;
  baseline: ConversionResult;
}) {
  const baselinePoints = resultPoints(options.baseline.rows);
  const baselineWinner = options.baseline.rows[0]?.code ?? null;
  let maxPointMovement = 0;
  let winnerSensitiveVoters = 0;

  for (const ballot of options.ballots) {
    const next = convertRound(
      rawTotals(options.participants, options.ballots.filter((candidate) => candidate.voterId !== ballot.voterId)),
      options.totalPoints,
      options.rankExponent,
    );
    if ((next.rows[0]?.code ?? null) !== baselineWinner) winnerSensitiveVoters += 1;
    const nextPoints = resultPoints(next.rows);
    for (const row of options.baseline.rows) {
      maxPointMovement = Math.max(
        maxPointMovement,
        Math.abs((nextPoints.get(row.code) ?? 0) - (baselinePoints.get(row.code) ?? 0)),
      );
    }
  }

  return { maxPointMovement, winnerSensitiveVoters };
}

function summaryFromRows(
  rows: Array<{ code: string; finalPoints: number }>,
  totalPoints: number,
  influence: { maxPointMovement: number; winnerSensitiveVoters: number },
): EngineBacktestSummary {
  const winnerPoints = rows[0]?.finalPoints ?? 0;
  const second = rows[1]?.finalPoints ?? 0;
  return {
    winner: rows[0]?.code ?? null,
    topThree: rows.slice(0, 3).map((row) => row.code),
    winnerPoints,
    winnerMargin: winnerPoints - second,
    topShare: totalPoints > 0 ? winnerPoints / totalPoints : 0,
    zeroPointEntries: rows.filter((row) => row.finalPoints === 0).length,
    maxSingleVoterPointMovement: influence.maxPointMovement,
    winnerSensitiveVoters: influence.winnerSensitiveVoters,
  };
}

export function buildCoordinatedAttackBallots(options: {
  participants: string[];
  target: string;
  attackers: number;
  prefix?: string;
}): RobustBallotInput[] {
  const fillers = options.participants.filter((code) => code !== options.target).slice(0, 4);
  if (fillers.length < 4) return [];
  const allocations = {
    [options.target]: 10,
    [fillers[0]!]: 3,
    [fillers[1]!]: 3,
    [fillers[2]!]: 2,
    [fillers[3]!]: 2,
  };
  return Array.from({ length: Math.max(0, Math.trunc(options.attackers)) }, (_, index) => ({
    voterId: `${options.prefix ?? "attack"}:${index + 1}`,
    allocations: { ...allocations },
  }));
}

export function backtestRound(options: {
  participants: string[];
  ballots: RobustBallotInput[];
  totalPoints: number;
  legacyRankExponent?: number;
  robustConfig?: Partial<RobustTelevoteConfig> | null;
  attackTarget?: string | null;
}): RoundBacktest {
  const rankExponent = Number(options.legacyRankExponent ?? 1.33);
  const legacy = convertRound(rawTotals(options.participants, options.ballots), options.totalPoints, rankExponent);
  const robust = convertRobustRound({
    participants: options.participants,
    ballots: options.ballots,
    totalPoints: options.totalPoints,
    config: options.robustConfig,
  });
  const legacyInfluenceResult = legacyInfluence({
    participants: options.participants,
    ballots: options.ballots,
    totalPoints: options.totalPoints,
    rankExponent,
    baseline: legacy,
  });
  const robustInfluence = analyseRobustInfluence({
    participants: options.participants,
    ballots: options.ballots,
    totalPoints: options.totalPoints,
    config: options.robustConfig,
  });
  const robustMaxMovement = Math.max(0, ...robustInfluence.voters.map((row) => row.maxPointMovement));
  const robustWinnerSensitive = robustInfluence.voters.filter((row) => row.winnerChanged).length;

  const target = options.attackTarget && options.participants.includes(options.attackTarget)
    ? options.attackTarget
    : legacy.rows.at(-1)?.code ?? options.participants.at(-1) ?? "";
  const legacyRanks = resultRank(legacy.rows);
  const robustRanks = resultRank(robust.rows);
  const legacyPoints = resultPoints(legacy.rows);
  const robustPoints = resultPoints(robust.rows);
  const attacks: AttackBacktest[] = [1, 2, 3].map((attackers) => {
    const attackBallots = buildCoordinatedAttackBallots({ participants: options.participants, target, attackers });
    const attacked = [...options.ballots, ...attackBallots];
    const legacyAfter = convertRound(rawTotals(options.participants, attacked), options.totalPoints, rankExponent);
    const robustAfter = convertRobustRound({
      participants: options.participants,
      ballots: attacked,
      totalPoints: options.totalPoints,
      config: options.robustConfig,
    });
    const legacyAfterRanks = resultRank(legacyAfter.rows);
    const robustAfterRanks = resultRank(robustAfter.rows);
    const legacyAfterPoints = resultPoints(legacyAfter.rows);
    const robustAfterPoints = resultPoints(robustAfter.rows);
    return {
      attackers,
      target,
      legacyRankBefore: legacyRanks.get(target) ?? options.participants.length,
      legacyRankAfter: legacyAfterRanks.get(target) ?? options.participants.length,
      legacyPointGain: (legacyAfterPoints.get(target) ?? 0) - (legacyPoints.get(target) ?? 0),
      robustRankBefore: robustRanks.get(target) ?? options.participants.length,
      robustRankAfter: robustAfterRanks.get(target) ?? options.participants.length,
      robustPointGain: (robustAfterPoints.get(target) ?? 0) - (robustPoints.get(target) ?? 0),
    };
  });

  return {
    legacy: summaryFromRows(legacy.rows, options.totalPoints, legacyInfluenceResult),
    robust: summaryFromRows(robust.rows, options.totalPoints, {
      maxPointMovement: robustMaxMovement,
      winnerSensitiveVoters: robustWinnerSensitive,
    }),
    winnerChangedBetweenEngines: (legacy.rows[0]?.code ?? null) !== (robust.rows[0]?.code ?? null),
    topThreeChangedBetweenEngines: !sameSet(
      legacy.rows.slice(0, 3).map((row) => row.code),
      robust.rows.slice(0, 3).map((row) => row.code),
    ),
    attacks,
  };
}

export function compareRobustResults(a: RobustTelevoteResult, b: RobustTelevoteResult) {
  return {
    winnerChanged: (a.rows[0]?.code ?? null) !== (b.rows[0]?.code ?? null),
    topThreeChanged: !sameSet(a.rows.slice(0, 3).map((row) => row.code), b.rows.slice(0, 3).map((row) => row.code)),
  };
}
