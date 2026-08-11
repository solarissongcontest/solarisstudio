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
  juryPoolTotal: number;
  televotePoolTotal: number;
  effectiveJuryWeight: number;
  effectiveTelevoteWeight: number;
};

export const RESULT_LAB_BLEND_MODES: ReadonlyArray<
  readonly [ResultLabBlendMode, string, string]
> = [
  [
    "raw",
    "Balanced points",
    "Rescale jury and televote into the exact selected balance, using whole-number points.",
  ],
  [
    "normalized",
    "Normalized share",
    "Compare each entry's share of the jury and televote pools while keeping the selected balance exact.",
  ],
  [
    "rank",
    "Rank blend",
    "Convert jury and televote rankings into whole-number point pools with the exact selected balance.",
  ],
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
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function wholeNumber(value: number) {
  return Math.max(0, Math.round(safeNumber(value)));
}

function normalizedWeights(juryWeight: number, televoteWeight: number) {
  const jury = Math.max(0, safeNumber(juryWeight));
  const televote = Math.max(0, safeNumber(televoteWeight));
  const total = jury + televote;

  if (total <= 0) {
    return { jury: 50, televote: 50 };
  }

  return {
    jury: (jury / total) * 100,
    televote: (televote / total) * 100,
  };
}

function greatestCommonDivisor(a: number, b: number) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));

  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }

  return x || 1;
}

function balancedPoolTargets(
  rawJuryTotal: number,
  rawTelevoteTotal: number,
  juryWeight: number,
  televoteWeight: number,
) {
  const weights = normalizedWeights(juryWeight, televoteWeight);
  const juryPercent = Math.round(weights.jury);
  const televotePercent = Math.round(weights.televote);

  if (juryPercent <= 0) {
    return {
      jury: 0,
      televote: wholeNumber(rawTelevoteTotal),
      juryWeight: 0,
      televoteWeight: 100,
    };
  }

  if (televotePercent <= 0) {
    return {
      jury: wholeNumber(rawJuryTotal),
      televote: 0,
      juryWeight: 100,
      televoteWeight: 0,
    };
  }

  const divisor = greatestCommonDivisor(juryPercent, televotePercent);
  const juryUnits = juryPercent / divisor;
  const televoteUnits = televotePercent / divisor;

  const availableJury = wholeNumber(rawJuryTotal);
  const availableTelevote = wholeNumber(rawTelevoteTotal);

  if (availableJury <= 0 || availableTelevote <= 0) {
    return {
      jury: 0,
      televote: 0,
      juryWeight: juryPercent,
      televoteWeight: televotePercent,
    };
  }

  /*
   * Use the largest whole-number multiplier that does not inflate either
   * source channel. This means removing juries makes the jury pool smaller,
   * and the televote pool is scaled down with it to preserve the selected
   * ratio instead of silently becoming more powerful.
   */
  const multiplier = Math.floor(
    Math.min(
      availableJury / juryUnits,
      availableTelevote / televoteUnits,
    ),
  );

  if (multiplier <= 0) {
    return {
      jury: 0,
      televote: 0,
      juryWeight: juryPercent,
      televoteWeight: televotePercent,
    };
  }

  return {
    jury: juryUnits * multiplier,
    televote: televoteUnits * multiplier,
    juryWeight: juryPercent,
    televoteWeight: televotePercent,
  };
}

function allocateWholeNumberPool(
  values: Map<string, number>,
  targetTotal: number,
) {
  const target = wholeNumber(targetTotal);
  const ids = [...values.keys()];
  const result = new Map(ids.map((id) => [id, 0]));

  if (target <= 0 || !ids.length) return result;

  const sourceTotal = ids.reduce(
    (sum, id) => sum + safeNumber(values.get(id) ?? 0),
    0,
  );

  if (sourceTotal <= 0) return result;

  const allocations = ids.map((id) => {
    const exact = (safeNumber(values.get(id) ?? 0) / sourceTotal) * target;
    const floor = Math.floor(exact);
    return {
      id,
      exact,
      floor,
      remainder: exact - floor,
    };
  });

  let assigned = allocations.reduce((sum, item) => sum + item.floor, 0);
  let remaining = target - assigned;

  allocations.sort(
    (a, b) =>
      b.remainder - a.remainder ||
      b.exact - a.exact ||
      a.id.localeCompare(b.id),
  );

  allocations.forEach((item) => {
    const bonus = remaining > 0 ? 1 : 0;
    if (bonus) remaining -= 1;
    result.set(item.id, item.floor + bonus);
  });

  assigned = [...result.values()].reduce((sum, value) => sum + value, 0);

  if (assigned !== target && allocations[0]) {
    const firstId = allocations[0].id;
    result.set(firstId, (result.get(firstId) ?? 0) + (target - assigned));
  }

  return result;
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

function rankScores(values: Map<string, number>) {
  const ranks = channelRanks(values);
  const count = values.size;
  return new Map(
    [...values.keys()].map((id) => [
      id,
      Math.max(0, count - (ranks.get(id) ?? count) + 1),
    ]),
  );
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
        totals.set(
          vote.recipientId,
          (totals.get(vote.recipientId) ?? 0) + wholeNumber(vote.points),
        );
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

  const rawJuryPoints = new Map<string, number>();
  const rawTelevotePoints = new Map<string, number>();

  for (const entry of officialEntries) {
    rawJuryPoints.set(
      entry.id,
      juryAggregation?.totals.get(entry.id) ?? wholeNumber(entry.juryPoints),
    );
    rawTelevotePoints.set(entry.id, wholeNumber(entry.televotePoints));
  }

  const rawJuryTotal = [...rawJuryPoints.values()].reduce((sum, value) => sum + value, 0);
  const rawTelevoteTotal = [...rawTelevotePoints.values()].reduce((sum, value) => sum + value, 0);

  const targets = balancedPoolTargets(
    rawJuryTotal,
    rawTelevoteTotal,
    config.juryWeight,
    config.televoteWeight,
  );

  const jurySource = config.blendMode === "rank" ? rankScores(rawJuryPoints) : rawJuryPoints;
  const televoteSource = config.blendMode === "rank" ? rankScores(rawTelevotePoints) : rawTelevotePoints;

  const juryPoints = allocateWholeNumberPool(jurySource, targets.jury);
  const televotePoints = allocateWholeNumberPool(televoteSource, targets.televote);

  const workingRows: ResultLabRow[] = officialEntries.map((entry) => {
    const jury = juryPoints.get(entry.id) ?? 0;
    const televote = televotePoints.get(entry.id) ?? 0;

    return {
      ...entry,
      simulatedJuryPoints: jury,
      simulatedTelevotePoints: televote,
      simulatedScore: jury + televote,
      simulatedRank: 0,
      rankDelta: null,
    };
  });

  workingRows.sort((a, b) => {
    const scoreDelta = b.simulatedScore - a.simulatedScore;
    if (scoreDelta !== 0) return scoreDelta;
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
    juryPoolTotal: targets.jury,
    televotePoolTotal: targets.televote,
    effectiveJuryWeight: targets.juryWeight,
    effectiveTelevoteWeight: targets.televoteWeight,
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
