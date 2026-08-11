import type { ResultRow } from "@/lib/data";

export type BroadcastEntry = {
  id: string;
  name: string;
  juryPoints: number;
  televotePoints: number;
  totalPoints: number;
  officialRank: number | null;
};

export type BroadcastReplayRow = BroadcastEntry & {
  juryRank: number;
  televoteRank: number;
  juryLeaderRank: number;
  finalRank: number;
  rankAfterTelevote: number;
  juryShare: number;
  televoteShare: number;
  juryTeleGap: number;
  juryToFinalChange: number;
};

export type BroadcastMomentKind =
  | "lead_change"
  | "comeback"
  | "collapse"
  | "jury_landslide"
  | "televote_surge"
  | "split_vote"
  | "photo_finish"
  | "balanced"
  | "dominant";

export type BroadcastMoment = {
  id: string;
  kind: BroadcastMomentKind;
  title: string;
  summary: string;
  countryId?: string;
  importance: number;
};

export type BroadcastMetric = {
  label: string;
  value: string;
  detail: string;
};

export type RevealStep = {
  index: number;
  countryId: string;
  name: string;
  juryPoints: number;
  televotePoints: number;
  totalBefore: number;
  totalAfter: number;
  rankBefore: number;
  rankAfter: number;
  rankChange: number;
  becameLeader: boolean;
  leaderId: string;
  leaderName: string;
  leaderScore: number;
};

export type BroadcastIntelligence = {
  rows: BroadcastReplayRow[];
  winner: BroadcastReplayRow | null;
  juryWinner: BroadcastReplayRow | null;
  televoteWinner: BroadcastReplayRow | null;
  biggestComeback: BroadcastReplayRow | null;
  biggestCollapse: BroadcastReplayRow | null;
  closestFinishGap: number | null;
  winnerMargin: number | null;
  juryTeleAgreement: number;
  leadChangeCount: number;
  volatilityScore: number;
  moments: BroadcastMoment[];
  metrics: BroadcastMetric[];
  replay: RevealStep[];
};

function safe(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function rankMap(
  entries: BroadcastEntry[],
  selector: (entry: BroadcastEntry) => number,
) {
  const sorted = [...entries].sort(
    (a, b) =>
      selector(b) - selector(a) ||
      (a.officialRank ?? Number.MAX_SAFE_INTEGER) -
        (b.officialRank ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );

  return new Map(sorted.map((entry, index) => [entry.id, index + 1]));
}

function rankCurrentScores(
  entries: BroadcastEntry[],
  scores: Map<string, number>,
) {
  return [...entries]
    .sort(
      (a, b) =>
        (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) ||
        safe(b.televotePoints) - safe(a.televotePoints) ||
        safe(b.juryPoints) - safe(a.juryPoints) ||
        a.name.localeCompare(b.name),
    )
    .map((entry) => entry.id);
}

function spearmanLikeAgreement(
  first: Map<string, number>,
  second: Map<string, number>,
  ids: string[],
) {
  if (ids.length < 2) return 100;

  const maxDifference = Math.max(1, ids.length - 1);

  const averageDifference =
    ids.reduce((sum, id) => {
      const a = first.get(id) ?? ids.length;
      const b = second.get(id) ?? ids.length;

      return sum + Math.abs(a - b) / maxDifference;
    }, 0) / ids.length;

  return Number(Math.max(0, (1 - averageDifference) * 100).toFixed(1));
}

export function broadcastEntriesFromResults(
  results: ResultRow[],
  nameForId: (id: string) => string,
): BroadcastEntry[] {
  return results
    .filter((row) => Boolean(row.country_id))
    .map((row) => ({
      id: row.country_id,
      name: nameForId(row.country_id),
      juryPoints: safe(row.jury_points),
      televotePoints: safe(row.televote_points),
      totalPoints: safe(row.total_points),
      officialRank: row.final_rank,
    }));
}

export function buildResultsReplay(
  entries: BroadcastEntry[],
): RevealStep[] {
  if (!entries.length) return [];

  /*
   * Eurovision-style replay:
   *
   * 1. Start with jury totals already on the board.
   * 2. Reveal televote from the lowest jury-ranked entry upward.
   * 3. After every reveal, recalculate the live leader.
   *
   * It does not pretend to reproduce the exact historical broadcast order
   * unless Solaris has stored one. It is a deterministic replay generated
   * from the official published totals.
   */

  const juryRanking = [...entries].sort(
    (a, b) =>
      b.juryPoints - a.juryPoints ||
      (a.officialRank ?? Number.MAX_SAFE_INTEGER) -
        (b.officialRank ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );

  const revealOrder = [...juryRanking].reverse();

  const scores = new Map(
    entries.map((entry) => [entry.id, entry.juryPoints]),
  );

  const steps: RevealStep[] = [];

  revealOrder.forEach((entry, index) => {
    const rankingBefore = rankCurrentScores(entries, scores);
    const rankBefore = rankingBefore.indexOf(entry.id) + 1;

    const totalBefore = scores.get(entry.id) ?? 0;
    const totalAfter = totalBefore + entry.televotePoints;

    scores.set(entry.id, totalAfter);

    const rankingAfter = rankCurrentScores(entries, scores);
    const rankAfter = rankingAfter.indexOf(entry.id) + 1;

    const leaderId = rankingAfter[0];
    const leader =
      entries.find((candidate) => candidate.id === leaderId) ??
      entry;

    const previousLeaderId = rankingBefore[0];

    steps.push({
      index: index + 1,
      countryId: entry.id,
      name: entry.name,
      juryPoints: entry.juryPoints,
      televotePoints: entry.televotePoints,
      totalBefore,
      totalAfter,
      rankBefore,
      rankAfter,
      rankChange: rankBefore - rankAfter,
      becameLeader:
        leaderId === entry.id &&
        previousLeaderId !== entry.id,
      leaderId,
      leaderName: leader.name,
      leaderScore: scores.get(leader.id) ?? 0,
    });
  });

  return steps;
}

export function buildBroadcastIntelligence(
  entriesInput: BroadcastEntry[],
): BroadcastIntelligence {
  const entries = [...entriesInput];

  if (!entries.length) {
    return {
      rows: [],
      winner: null,
      juryWinner: null,
      televoteWinner: null,
      biggestComeback: null,
      biggestCollapse: null,
      closestFinishGap: null,
      winnerMargin: null,
      juryTeleAgreement: 0,
      leadChangeCount: 0,
      volatilityScore: 0,
      moments: [],
      metrics: [],
      replay: [],
    };
  }

  const juryRanks = rankMap(entries, (entry) => entry.juryPoints);
  const televoteRanks = rankMap(
    entries,
    (entry) => entry.televotePoints,
  );
  const finalRanks = rankMap(
    entries,
    (entry) => entry.totalPoints,
  );

  const totalPoints =
    entries.reduce(
      (sum, entry) => sum + entry.totalPoints,
      0,
    ) || 1;

  const rows: BroadcastReplayRow[] = entries
    .map((entry) => {
      const juryRank =
        juryRanks.get(entry.id) ??
        entries.length;

      const televoteRank =
        televoteRanks.get(entry.id) ??
        entries.length;

      const finalRank =
        entry.officialRank ??
        finalRanks.get(entry.id) ??
        entries.length;

      const total =
        entry.juryPoints +
        entry.televotePoints;

      const juryShare =
        total > 0
          ? (entry.juryPoints / total) * 100
          : 0;

      const televoteShare =
        total > 0
          ? (entry.televotePoints / total) * 100
          : 0;

      return {
        ...entry,
        juryRank,
        televoteRank,
        juryLeaderRank: juryRank,
        finalRank,
        rankAfterTelevote: finalRank,
        juryShare: Number(juryShare.toFixed(1)),
        televoteShare: Number(
          televoteShare.toFixed(1),
        ),
        juryTeleGap:
          entry.televotePoints -
          entry.juryPoints,
        juryToFinalChange:
          juryRank - finalRank,
      };
    })
    .sort(
      (a, b) =>
        a.finalRank - b.finalRank ||
        b.totalPoints - a.totalPoints,
    );

  const winner = rows[0] ?? null;

  const juryWinner =
    [...rows].sort(
      (a, b) =>
        b.juryPoints - a.juryPoints ||
        a.finalRank - b.finalRank,
    )[0] ?? null;

  const televoteWinner =
    [...rows].sort(
      (a, b) =>
        b.televotePoints -
          a.televotePoints ||
        a.finalRank - b.finalRank,
    )[0] ?? null;

  const biggestComeback =
    [...rows]
      .filter(
        (row) => row.juryToFinalChange > 0,
      )
      .sort(
        (a, b) =>
          b.juryToFinalChange -
          a.juryToFinalChange,
      )[0] ?? null;

  const biggestCollapse =
    [...rows]
      .filter(
        (row) => row.juryToFinalChange < 0,
      )
      .sort(
        (a, b) =>
          a.juryToFinalChange -
          b.juryToFinalChange,
      )[0] ?? null;

  const sortedTotals = [...rows].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints,
  );

  const winnerMargin =
    sortedTotals.length >= 2
      ? sortedTotals[0].totalPoints -
        sortedTotals[1].totalPoints
      : null;

  const positiveGaps: number[] = [];

  for (
    let index = 0;
    index < sortedTotals.length - 1;
    index += 1
  ) {
    positiveGaps.push(
      sortedTotals[index].totalPoints -
        sortedTotals[index + 1].totalPoints,
    );
  }

  const closestFinishGap =
    positiveGaps.length
      ? Math.min(...positiveGaps)
      : null;

  const ids = entries.map((entry) => entry.id);

  const juryTeleAgreement =
    spearmanLikeAgreement(
      juryRanks,
      televoteRanks,
      ids,
    );

  const replay = buildResultsReplay(entries);

  const leadChangeCount = replay.reduce(
    (count, step, index) => {
      if (index === 0) return count;

      return (
        count +
        (replay[index - 1].leaderId !==
        step.leaderId
          ? 1
          : 0)
      );
    },
    0,
  );

  const averageMovement =
    rows.reduce(
      (sum, row) =>
        sum +
        Math.abs(row.juryToFinalChange),
      0,
    ) / Math.max(1, rows.length);

  const volatilityScore = Number(
    Math.min(
      100,
      averageMovement *
        (100 / Math.max(2, rows.length)) *
        2.2,
    ).toFixed(1),
  );

  const moments: BroadcastMoment[] = [];

  if (
    winner &&
    juryWinner &&
    winner.id !== juryWinner.id
  ) {
    moments.push({
      id: "winner-overturn",
      kind: "lead_change",
      title: `${winner.name} overturned the jury result`,
      summary: `${juryWinner.name} led the jury vote, but ${winner.name} finished as the overall winner.`,
      countryId: winner.id,
      importance: 100,
    });
  }

  if (
    winner &&
    televoteWinner &&
    winner.id === televoteWinner.id &&
    winner.televoteRank === 1
  ) {
    moments.push({
      id: `tele-winner:${winner.id}`,
      kind: "televote_surge",
      title: `${winner.name} converted televote strength into victory`,
      summary: `${winner.televotePoints} televote points helped secure the overall win.`,
      countryId: winner.id,
      importance: 93,
    });
  }

  if (
    biggestComeback &&
    biggestComeback.juryToFinalChange >= 3
  ) {
    moments.push({
      id: `comeback:${biggestComeback.id}`,
      kind: "comeback",
      title: `${biggestComeback.name} staged the biggest comeback`,
      summary: `It rose from #${biggestComeback.juryRank} after the jury vote to #${biggestComeback.finalRank} overall.`,
      countryId: biggestComeback.id,
      importance:
        80 +
        biggestComeback.juryToFinalChange,
    });
  }

  if (
    biggestCollapse &&
    Math.abs(
      biggestCollapse.juryToFinalChange,
    ) >= 3
  ) {
    moments.push({
      id: `collapse:${biggestCollapse.id}`,
      kind: "collapse",
      title: `${biggestCollapse.name} suffered the sharpest fall`,
      summary: `It moved from #${biggestCollapse.juryRank} with juries to #${biggestCollapse.finalRank} overall.`,
      countryId: biggestCollapse.id,
      importance:
        75 +
        Math.abs(
          biggestCollapse.juryToFinalChange,
        ),
    });
  }

  const strongestTeleSurge =
    [...rows].sort(
      (a, b) =>
        b.juryTeleGap - a.juryTeleGap,
    )[0];

  if (
    strongestTeleSurge &&
    strongestTeleSurge.juryTeleGap > 0
  ) {
    moments.push({
      id: `tele-surge:${strongestTeleSurge.id}`,
      kind: "televote_surge",
      title: `${strongestTeleSurge.name} had the strongest televote surge`,
      summary: `The televote gave it ${strongestTeleSurge.juryTeleGap} more points than the jury.`,
      countryId: strongestTeleSurge.id,
      importance:
        70 +
        Math.min(
          20,
          strongestTeleSurge.juryTeleGap /
            10,
        ),
    });
  }

  const strongestJuryBias =
    [...rows].sort(
      (a, b) =>
        a.juryTeleGap - b.juryTeleGap,
    )[0];

  if (
    strongestJuryBias &&
    strongestJuryBias.juryTeleGap < 0
  ) {
    moments.push({
      id: `jury-landslide:${strongestJuryBias.id}`,
      kind: "jury_landslide",
      title: `${strongestJuryBias.name} relied most heavily on juries`,
      summary: `The jury awarded ${Math.abs(strongestJuryBias.juryTeleGap)} more points than the televote.`,
      countryId: strongestJuryBias.id,
      importance:
        68 +
        Math.min(
          20,
          Math.abs(
            strongestJuryBias.juryTeleGap,
          ) / 10,
        ),
    });
  }

  const mostBalanced =
    [...rows]
      .filter(
        (row) =>
          row.juryPoints +
            row.televotePoints >
          0,
      )
      .sort(
        (a, b) =>
          Math.abs(a.juryTeleGap) -
          Math.abs(b.juryTeleGap),
      )[0];

  if (mostBalanced) {
    moments.push({
      id: `balanced:${mostBalanced.id}`,
      kind: "balanced",
      title: `${mostBalanced.name} had the most balanced support`,
      summary: `${mostBalanced.juryPoints} jury points and ${mostBalanced.televotePoints} televote points.`,
      countryId: mostBalanced.id,
      importance: 55,
    });
  }

  if (
    winnerMargin != null &&
    winnerMargin <= 5 &&
    rows.length > 1
  ) {
    moments.push({
      id: "photo-finish",
      kind: "photo_finish",
      title: "The contest ended in a photo finish",
      summary: `Only ${winnerMargin} point${winnerMargin === 1 ? "" : "s"} separated first and second place.`,
      importance: 98,
    });
  }

  if (
    winner &&
    winner.totalPoints / totalPoints >=
      0.12
  ) {
    moments.push({
      id: `dominant:${winner.id}`,
      kind: "dominant",
      title: `${winner.name} claimed a major share of all points`,
      summary: `${((winner.totalPoints / totalPoints) * 100).toFixed(1)}% of all awarded points went to the winner.`,
      countryId: winner.id,
      importance: 60,
    });
  }

  moments.sort(
    (a, b) =>
      b.importance - a.importance ||
      a.title.localeCompare(b.title),
  );

  const metrics: BroadcastMetric[] = [
    {
      label: "Winner margin",
      value:
        winnerMargin == null
          ? "—"
          : `${winnerMargin} pts`,
      detail:
        winnerMargin == null
          ? "Only one result is available."
          : "Gap between first and second place.",
    },
    {
      label: "Jury ↔ televote agreement",
      value: `${juryTeleAgreement}%`,
      detail:
        juryTeleAgreement >= 80
          ? "The two voting groups broadly agreed."
          : juryTeleAgreement >= 60
            ? "There was noticeable disagreement."
            : "The jury and televote saw this field very differently.",
    },
    {
      label: "Lead changes",
      value: String(leadChangeCount),
      detail:
        leadChangeCount === 0
          ? "The jury leader survived the generated televote replay."
          : "Changes of leader during the generated televote reveal.",
    },
    {
      label: "Scoreboard volatility",
      value: `${volatilityScore}%`,
      detail:
        volatilityScore >= 60
          ? "Large movements between jury and final rankings."
          : volatilityScore >= 30
            ? "A moderately unstable scoreboard."
            : "The jury ranking mostly survived the televote.",
    },
  ];

  return {
    rows,
    winner,
    juryWinner,
    televoteWinner,
    biggestComeback,
    biggestCollapse,
    closestFinishGap,
    winnerMargin,
    juryTeleAgreement,
    leadChangeCount,
    volatilityScore,
    moments,
    metrics,
    replay,
  };
}

export function replayProgress(
  entries: BroadcastEntry[],
  revealedSteps: number,
) {
  const replay = buildResultsReplay(entries);
  const count = Math.max(
    0,
    Math.min(replay.length, revealedSteps),
  );

  const scores = new Map(
    entries.map((entry) => [
      entry.id,
      entry.juryPoints,
    ]),
  );

  replay.slice(0, count).forEach((step) => {
    scores.set(
      step.countryId,
      step.totalAfter,
    );
  });

  const revealed = new Set(
    replay
      .slice(0, count)
      .map((step) => step.countryId),
  );

  const ranking = rankCurrentScores(
    entries,
    scores,
  );

  return ranking.map((id, index) => {
    const entry = entries.find(
      (candidate) => candidate.id === id,
    )!;

    return {
      ...entry,
      liveRank: index + 1,
      liveScore: scores.get(id) ?? 0,
      televoteRevealed: revealed.has(id),
    };
  });
}
