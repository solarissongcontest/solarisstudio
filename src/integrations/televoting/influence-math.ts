import {
  convertRobustRound,
  type RobustBallotInput,
  type RobustTelevoteConfig,
  type RobustTelevoteResult,
} from "@/integrations/televoting/robust-televote-math";

export type ResultInfluenceSummary = {
  winnerChanged: boolean;
  topThreeChanged: boolean;
  qualifierChanged: boolean;
  maxRankMovement: number;
  maxPointMovement: number;
  mostAffectedEntry: string | null;
};

export type VoterInfluence = ResultInfluenceSummary & {
  voterId: string;
};

export type ClusterInfluence = ResultInfluenceSummary & {
  clusterId: string;
  members: string[];
};

export type RobustInfluenceResult = {
  baseline: RobustTelevoteResult;
  voters: VoterInfluence[];
  clusters: ClusterInfluence[];
};

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const B = new Set(b);
  return a.every((value) => B.has(value));
}

function resultRanks(result: RobustTelevoteResult) {
  return new Map(result.rows.map((row, index) => [row.code, index + 1]));
}

function compareResults(
  baseline: RobustTelevoteResult,
  counterfactual: RobustTelevoteResult,
  qualifierCount: number | null | undefined,
): ResultInfluenceSummary {
  const baselineWinner = baseline.rows[0]?.code ?? null;
  const nextWinner = counterfactual.rows[0]?.code ?? null;
  const baselineTopThree = baseline.rows.slice(0, 3).map((row) => row.code);
  const nextTopThree = counterfactual.rows.slice(0, 3).map((row) => row.code);
  const q = Math.max(0, Math.trunc(Number(qualifierCount) || 0));
  const baselineQualifiers = q > 0 ? baseline.rows.slice(0, q).map((row) => row.code) : [];
  const nextQualifiers = q > 0 ? counterfactual.rows.slice(0, q).map((row) => row.code) : [];
  const baselineRanks = resultRanks(baseline);
  const nextRanks = resultRanks(counterfactual);
  const baselinePoints = new Map(baseline.rows.map((row) => [row.code, row.finalPoints]));
  const nextPoints = new Map(counterfactual.rows.map((row) => [row.code, row.finalPoints]));

  let maxRankMovement = 0;
  let maxPointMovement = 0;
  let mostAffectedEntry: string | null = null;
  for (const row of baseline.rows) {
    const rankMovement = Math.abs((nextRanks.get(row.code) ?? baseline.rows.length) - (baselineRanks.get(row.code) ?? baseline.rows.length));
    const pointMovement = Math.abs((nextPoints.get(row.code) ?? 0) - (baselinePoints.get(row.code) ?? 0));
    if (rankMovement > maxRankMovement || (rankMovement === maxRankMovement && pointMovement > maxPointMovement)) {
      maxRankMovement = rankMovement;
      maxPointMovement = pointMovement;
      mostAffectedEntry = row.code;
    } else if (pointMovement > maxPointMovement) {
      maxPointMovement = pointMovement;
      if (maxRankMovement === 0) mostAffectedEntry = row.code;
    }
  }

  return {
    winnerChanged: baselineWinner !== nextWinner,
    topThreeChanged: !sameSet(baselineTopThree, nextTopThree),
    qualifierChanged: q > 0 ? !sameSet(baselineQualifiers, nextQualifiers) : false,
    maxRankMovement,
    maxPointMovement,
    mostAffectedEntry,
  };
}

export function analyseRobustInfluence(options: {
  participants: string[];
  ballots: RobustBallotInput[];
  totalPoints: number;
  config?: Partial<RobustTelevoteConfig> | null;
  qualifierCount?: number | null;
  clusters?: Array<{ id: string; members: string[] }>;
}): RobustInfluenceResult {
  const baseline = convertRobustRound({
    participants: options.participants,
    ballots: options.ballots,
    totalPoints: options.totalPoints,
    config: options.config,
  });

  const voters = options.ballots.map<VoterInfluence>((ballot) => {
    const counterfactual = convertRobustRound({
      participants: options.participants,
      ballots: options.ballots.filter((candidate) => candidate.voterId !== ballot.voterId),
      totalPoints: options.totalPoints,
      config: options.config,
    });
    return {
      voterId: ballot.voterId,
      ...compareResults(baseline, counterfactual, options.qualifierCount),
    };
  });

  const clusters = (options.clusters ?? []).map<ClusterInfluence>((cluster) => {
    const members = [...new Set(cluster.members)];
    const memberSet = new Set(members);
    const counterfactual = convertRobustRound({
      participants: options.participants,
      ballots: options.ballots.filter((ballot) => !memberSet.has(ballot.voterId)),
      totalPoints: options.totalPoints,
      config: options.config,
    });
    return {
      clusterId: cluster.id,
      members,
      ...compareResults(baseline, counterfactual, options.qualifierCount),
    };
  });

  voters.sort(
    (a, b) =>
      Number(b.winnerChanged) - Number(a.winnerChanged) ||
      Number(b.qualifierChanged) - Number(a.qualifierChanged) ||
      Number(b.topThreeChanged) - Number(a.topThreeChanged) ||
      b.maxRankMovement - a.maxRankMovement ||
      b.maxPointMovement - a.maxPointMovement ||
      a.voterId.localeCompare(b.voterId),
  );
  clusters.sort(
    (a, b) =>
      Number(b.winnerChanged) - Number(a.winnerChanged) ||
      Number(b.qualifierChanged) - Number(a.qualifierChanged) ||
      Number(b.topThreeChanged) - Number(a.topThreeChanged) ||
      b.maxRankMovement - a.maxRankMovement ||
      b.maxPointMovement - a.maxPointMovement ||
      a.clusterId.localeCompare(b.clusterId),
  );

  return { baseline, voters, clusters };
}
