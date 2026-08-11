export type ResultLabBlendMode = "raw" | "normalized" | "rank";
export type ResultLabJuryScheme = "original" | "classic" | "linear10" | "top5" | "winner";
export type ResultLabTieBreak = "televote" | "jury" | "official" | "alphabetical";

export type ResultLabOfficialEntry = {
  id: string;
  name: string;
  juryPoints: number;
  televotePoints: number;
  officialRank: number | null;
};

export type ResultLabJuryVote = {
  voterKey: string;
  recipientId: string;
  points: number;
};

export type ResultLabConfig = {
  juryWeight: number;
  televoteWeight: number;
  blendMode: ResultLabBlendMode;
  juryScheme: ResultLabJuryScheme;
  tieBreak: ResultLabTieBreak;
  excludedVoters: ReadonlySet<string>;
};

export type ResultLabRow = ResultLabOfficialEntry & {
  simulatedJuryPoints: number;
  simulatedTelevotePoints: number;
  simulatedScore: number;
  simulatedRank: number;
  rankDelta: number | null;
};

export type ResultLabSimulation = {
  rows: ResultLabRow[];
  includedVoterCount: number;
  availableVoterCount: number;
  juryRecalculated: boolean;
};

export const RESULT_LAB_BLEND_MODES: ReadonlyArray<
  readonly [ResultLabBlendMode, string, string]
> = [
  ["raw", "Weighted points", "Blend the actual jury and televote point totals."],
  ["normalized", "Normalized share", "Give each voting channel exactly its chosen percentage of the result."],
  ["rank", "Rank blend", "Blend jury and televote rankings instead of their point margins."],
];

export const RESULT_LAB_JURY_SCHEMES: ReadonlyArray<
  readonly [ResultLabJuryScheme, string, string]
> = [
  ["original", "Original ballots", "Use every jury ballot exactly as it was entered."],
  ["classic", "12–10–8", "Re-score each jury ballot as 12, 10, 8, 7…1."],
  ["linear10", "10 to 1", "Re-score the top ten as 10, 9, 8…1."],
  ["top5", "Top five", "Only the top five in each jury receive 12, 8, 6, 4, 2."],
  ["winner", "Winner takes all", "Only each jury's first place receives 12 points."],
];

export const RESULT_LAB_TIE_BREAKS: ReadonlyArray<readonly [ResultLabTieBreak, string]> = [
  ["televote", "Higher televote"],
  ["jury", "Higher jury"],
  ["official", "Better official rank"],
  ["alphabetical", "Alphabetical"],
];

const JURY_SCHEME_POINTS: Record<Exclude<ResultLabJuryScheme, "original">, number[]> = {
  classic: [12, 10, 8, 7, 6, 5, 4, 3, 2, 1],
  linear10: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  top5: [12, 8, 6, 4, 2],
  winner: [12],
};

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function normalizedWeights(juryWeight: number, televoteWeight: number) {
  const jury = Math.max(0, safeNumber(juryWeight));
  const televote = Math.max(0, safeNumber(televoteWeight));
  const total = jury + televote;

  if (total <= 0) {
    return { jury: 0.5, televote: 0.5 };
  }

  return {
    jury: jury / total,
    televote: televote / total,
  };
}

function channelRanks(values: Map<string, number>) {
  const ordered = [...values.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const ranks = new Map<string, number>();

  ordered.forEach(([id], index) => {
    ranks.set(id, index + 1);
  });

  return ranks;
}

function aggregateJuryVotes(
  officialEntries: ResultLabOfficialEntry[],
  juryVotes: ResultLabJuryVote[],
  scheme: ResultLabJuryScheme,
  excludedVoters: ReadonlySet<string>,
) {
  const officialIds = new Set(officialEntries.map((entry) => entry.id));
  const byVoter = new Map<string, ResultLabJuryVote[]>();

  for (const vote of juryVotes) {
    if (!vote.voterKey || excludedVoters.has(vote.voterKey) || !officialIds.has(vote.recipientId)) {
      continue;
    }

    const ballot = byVoter.get(vote.voterKey) ?? [];
    ballot.push(vote);
    byVoter.set(vote.voterKey, ballot);
  }

  const totals = new Map(officialEntries.map((entry) => [entry.id, 0]));

  for (const ballot of byVoter.values()) {
    const ordered = [...ballot].sort(
      (a, b) => b.points - a.points || a.recipientId.localeCompare(b.recipientId),
    );

    if (scheme === "original") {
      for (const vote of ordered) {
        totals.set(vote.recipientId, (totals.get(vote.recipientId) ?? 0) + safeNumber(vote.points));
      }
      continue;
    }

    const pointScale = JURY_SCHEME_POINTS[scheme];
    ordered.slice(0, pointScale.length).forEach((vote, index) => {
      totals.set(vote.recipientId, (totals.get(vote.recipientId) ?? 0) + pointScale[index]);
    });
  }

  return {
    totals,
    voterCount: byVoter.size,
  };
}

function tieBreakCompare(a: ResultLabRow, b: ResultLabRow, tieBreak: ResultLabTieBreak) {
  if (tieBreak === "televote") {
    const televote = b.simulatedTelevotePoints - a.simulatedTelevotePoints;
    if (televote !== 0) return televote;
    const jury = b.simulatedJuryPoints - a.simulatedJuryPoints;
    if (jury !== 0) return jury;
  }

  if (tieBreak === "jury") {
    const jury = b.simulatedJuryPoints - a.simulatedJuryPoints;
    if (jury !== 0) return jury;
    const televote = b.simulatedTelevotePoints - a.simulatedTelevotePoints;
    if (televote !== 0) return televote;
  }

  if (tieBreak === "official") {
    const aRank = a.officialRank ?? Number.MAX_SAFE_INTEGER;
    const bRank = b.officialRank ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
  }

  return a.name.localeCompare(b.name);
}

export function simulateResultLab({
  officialEntries,
  juryVotes,
  config,
}: {
  officialEntries: ResultLabOfficialEntry[];
  juryVotes: ResultLabJuryVote[];
  config: ResultLabConfig;
}): ResultLabSimulation {
  const weights = normalizedWeights(config.juryWeight, config.televoteWeight);
  const availableVoters = new Set(juryVotes.map((vote) => vote.voterKey).filter(Boolean));
  const canRecalculateJury = juryVotes.length > 0 && availableVoters.size > 0;

  const juryAggregation = canRecalculateJury
    ? aggregateJuryVotes(
        officialEntries,
        juryVotes,
        config.juryScheme,
        config.excludedVoters,
      )
    : null;

  const juryPoints = new Map<string, number>();
  const televotePoints = new Map<string, number>();

  for (const entry of officialEntries) {
    juryPoints.set(
      entry.id,
      juryAggregation?.totals.get(entry.id) ?? safeNumber(entry.juryPoints),
    );
    televotePoints.set(entry.id, safeNumber(entry.televotePoints));
  }

  const juryTotal = [...juryPoints.values()].reduce((sum, value) => sum + value, 0);
  const televoteTotal = [...televotePoints.values()].reduce((sum, value) => sum + value, 0);
  const juryRanks = channelRanks(juryPoints);
  const televoteRanks = channelRanks(televotePoints);
  const entryCount = officialEntries.length;

  const workingRows: ResultLabRow[] = officialEntries.map((entry) => {
    const jury = juryPoints.get(entry.id) ?? 0;
    const televote = televotePoints.get(entry.id) ?? 0;
    let score = 0;

    if (config.blendMode === "raw") {
      score = jury * (weights.jury * 2) + televote * (weights.televote * 2);
    } else if (config.blendMode === "normalized") {
      const juryShare = juryTotal > 0 ? jury / juryTotal : 0;
      const televoteShare = televoteTotal > 0 ? televote / televoteTotal : 0;
      score = (juryShare * weights.jury + televoteShare * weights.televote) * 100;
    } else {
      const juryRank = juryRanks.get(entry.id) ?? entryCount;
      const televoteRank = televoteRanks.get(entry.id) ?? entryCount;
      const juryRankScore = Math.max(0, entryCount - juryRank + 1);
      const televoteRankScore = Math.max(0, entryCount - televoteRank + 1);
      score = juryRankScore * weights.jury + televoteRankScore * weights.televote;
    }

    return {
      ...entry,
      simulatedJuryPoints: jury,
      simulatedTelevotePoints: televote,
      simulatedScore: Number(score.toFixed(4)),
      simulatedRank: 0,
      rankDelta: null,
    };
  });

  workingRows.sort((a, b) => {
    const scoreDelta = b.simulatedScore - a.simulatedScore;
    if (Math.abs(scoreDelta) > 0.000001) return scoreDelta;
    return tieBreakCompare(a, b, config.tieBreak);
  });

  const rows = workingRows.map((row, index) => {
    const simulatedRank = index + 1;
    return {
      ...row,
      simulatedRank,
      rankDelta:
        row.officialRank == null ? null : row.officialRank - simulatedRank,
    };
  });

  return {
    rows,
    includedVoterCount: juryAggregation?.voterCount ?? availableVoters.size,
    availableVoterCount: availableVoters.size,
    juryRecalculated: Boolean(juryAggregation),
  };
}

export function resultLabCsv(rows: ResultLabRow[]) {
  const escape = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };

  const header = [
    "Simulated rank",
    "Country",
    "Simulated score",
    "Jury points",
    "Televote points",
    "Official rank",
    "Rank change",
  ];

  const body = rows.map((row) => [
    row.simulatedRank,
    row.name,
    row.simulatedScore,
    row.simulatedJuryPoints,
    row.simulatedTelevotePoints,
    row.officialRank,
    row.rankDelta,
  ]);

  return [header, ...body].map((line) => line.map(escape).join(",")).join("\n");
}
