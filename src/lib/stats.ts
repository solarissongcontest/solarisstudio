/**
 * Advanced statistics & analytics engine.
 *
 * Solaris chronology is based on EDITION NUMBER.
 * Calendar years must never be used to order contest history.
 */

import type {
  Country,
  Edition,
  JuryVote,
  Participant,
  ResultRow,
  Show,
  Televote,
} from "./data";

import { isTopScore, makeTopScoreResolver } from "./voting";

/* ============================================================
   HELPERS
   ============================================================ */

export type EditionMeta = {
  id: string;
  editionNumber: number | null;
  label: string;
};

export function toEditionMeta(editions: Edition[]): Map<string, EditionMeta> {
  const map = new Map<string, EditionMeta>();

  for (const edition of editions) {
    map.set(edition.id, {
      id: edition.id,
      editionNumber: edition.edition_number,
      label:
        edition.edition_number != null
          ? `SSC ${edition.edition_number}`
          : edition.name,
    });
  }

  return map;
}

function editionOrder(meta: EditionMeta | undefined): number {
  return meta?.editionNumber ?? Number.MAX_SAFE_INTEGER;
}

const avg = (values: number[]): number | null =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

const finiteRanks = (rows: ResultRow[]): number[] =>
  rows
    .map((row) => row.final_rank)
    .filter((rank): rank is number => rank != null);

function withVoterCountry(
  jury: JuryVote[],
): Array<JuryVote & { voter_country_id: string }> {
  return jury.filter(
    (vote): vote is JuryVote & { voter_country_id: string } =>
      !!vote.voter_country_id,
  );
}

function longestStreak(values: boolean[]): number {
  let best = 0;
  let current = 0;

  for (const value of values) {
    current = value ? current + 1 : 0;
    best = Math.max(best, current);
  }

  return best;
}

function currentStreak(values: boolean[]): number {
  let current = 0;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (!values[index]) break;
    current += 1;
  }

  return current;
}

/* ============================================================
   1. COUNTRY STATISTICS
   ============================================================ */

export type CountryTimelinePoint = {
  editionId: string;
  editionNumber: number | null;
  label: string;
  showId: string | null;
  jury: number;
  televote: number;
  total: number;
  rank: number | null;
  qualified: boolean | null;
};

export type CountryStats = {
  countryId: string;
  participations: number;
  finals: number;
  semis: number;
  qualifications: number;
  qualificationPct: number | null;
  grandFinalAppearancePct: number | null;
  wins: number;
  winPct: number | null;
  podiums: number;
  podiumPct: number | null;
  top5: number;
  top5Pct: number | null;
  top10: number;
  top10Pct: number | null;
  lastPlaces: number;
  nilPointers: number;
  avgJuryPlacement: number | null;
  avgTelevotePlacement: number | null;
  avgCombinedPlacement: number | null;
  avgPointsPerParticipation: number | null;
  avgPointsPerVoter: number | null;
  avgReceivedPerContest: number | null;
  avgGivenPerContest: number | null;
  avgQualificationRank: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  timeline: CountryTimelinePoint[];
  rolling5: Array<{
    editionId: string;
    editionNumber: number | null;
    avgPlacement: number | null;
  }>;
  biggestImprovement:
    | {
        fromEdition: number | null;
        toEdition: number | null;
        delta: number;
      }
    | null;
  biggestDecline:
    | {
        fromEdition: number | null;
        toEdition: number | null;
        delta: number;
      }
    | null;
  bestPlacementStreak: number;
  worstPlacementStreak: number;
  consecutiveQualifications: number;
  consecutiveFinals: number;
  consecutiveTop10: number;
  consecutivePodiums: number;
  favouriteRecipient: { countryId: string; points: number } | null;
  mostGenerousTowards: { countryId: string; points: number } | null;
  harshestTowards: { countryId: string; points: number } | null;
  distinctCountriesAwarded: number;
  neverAwarded: string[];
  neverVotedForThem: string[];
  neverVotedFor: string[];
  topScoresReceived: number;
  topScoresGiven: number;
  topGiversOfTopScore: Array<{ countryId: string; count: number }>;
  topReceiversOfTopScore: Array<{ countryId: string; count: number }>;
  firstTopScore:
    | {
        editionNumber: number | null;
        from: string;
        to: string;
      }
    | null;
  latestTopScore:
    | {
        editionNumber: number | null;
        from: string;
        to: string;
      }
    | null;
  longestDroughtWithoutTopScore: number;
};

export function computeCountryStats(
  countryId: string,
  opts: {
    editions: Edition[];
    shows: Show[];
    participants: Participant[];
    results: ResultRow[];
    jury: JuryVote[];
    televote: Televote[];
  },
): CountryStats {
  const editionMeta = toEditionMeta(opts.editions);
  const showById = new Map(opts.shows.map((show) => [show.id, show]));
  const jury = withVoterCountry(opts.jury);
  const resolveTop = makeTopScoreResolver(opts.shows);

  const myResults = opts.results.filter(
    (result) => result.country_id === countryId,
  );

  const myParticipants = opts.participants.filter(
    (participant) => participant.country_id === countryId,
  );

  const finalsResults = myResults.filter(
    (result) =>
      showById.get(result.show_id ?? "")?.kind === "grand-final",
  );

  const semiResults = myResults.filter(
    (result) => showById.get(result.show_id ?? "")?.kind === "semi-final",
  );

  const semiParticipants = myParticipants.filter(
    (participant) =>
      showById.get(participant.show_id ?? "")?.kind === "semi-final",
  );

  const qualified = semiParticipants.filter(
    (participant) => participant.qualified === true,
  );

  const finalRanks = finiteRanks(finalsResults);
  const wins = finalRanks.filter((rank) => rank === 1).length;
  const podiums = finalRanks.filter((rank) => rank <= 3).length;
  const top5 = finalRanks.filter((rank) => rank <= 5).length;
  const top10 = finalRanks.filter((rank) => rank <= 10).length;

  const lastPlaces = finalsResults.filter((result) => {
    const showRows = opts.results.filter(
      (row) => row.show_id === result.show_id,
    );
    const maxRank = Math.max(0, ...finiteRanks(showRows));
    return result.final_rank != null && result.final_rank === maxRank;
  }).length;

  const nilPointers = myResults.filter(
    (result) => result.total_points === 0,
  ).length;

  const timeline: CountryTimelinePoint[] = myResults
    .map((result) => {
      const meta = editionMeta.get(result.edition_id);
      const participant = myParticipants.find(
        (candidate) => candidate.show_id === result.show_id,
      );

      return {
        editionId: result.edition_id,
        editionNumber: meta?.editionNumber ?? null,
        label: meta?.label ?? "Edition",
        showId: result.show_id,
        jury: result.jury_points,
        televote: result.televote_points,
        total: result.total_points,
        rank: result.final_rank,
        qualified: participant?.qualified ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.editionNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.editionNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const finalTimeline = timeline.filter(
    (point) => showById.get(point.showId ?? "")?.kind === "grand-final",
  );

  const rolling5 = finalTimeline.map((_, index) => {
    const window = finalTimeline.slice(Math.max(0, index - 4), index + 1);
    const ranks = window
      .map((point) => point.rank)
      .filter((rank): rank is number => rank != null);

    return {
      editionId: finalTimeline[index].editionId,
      editionNumber: finalTimeline[index].editionNumber,
      avgPlacement: avg(ranks),
    };
  });

  let biggestImprovement: CountryStats["biggestImprovement"] = null;
  let biggestDecline: CountryStats["biggestDecline"] = null;

  for (let index = 1; index < finalTimeline.length; index += 1) {
    const previous = finalTimeline[index - 1];
    const current = finalTimeline[index];

    if (previous.rank == null || current.rank == null) continue;

    const delta = previous.rank - current.rank;

    if (
      delta > 0 &&
      (biggestImprovement === null || delta > biggestImprovement.delta)
    ) {
      biggestImprovement = {
        fromEdition: previous.editionNumber,
        toEdition: current.editionNumber,
        delta,
      };
    }

    if (
      delta < 0 &&
      (biggestDecline === null || delta < biggestDecline.delta)
    ) {
      biggestDecline = {
        fromEdition: previous.editionNumber,
        toEdition: current.editionNumber,
        delta,
      };
    }
  }

  const top10Flags = finalTimeline.map(
    (point) => point.rank != null && point.rank <= 10,
  );

  const podiumFlags = finalTimeline.map(
    (point) => point.rank != null && point.rank <= 3,
  );

  const qualFlagsBySemi = semiParticipants
    .slice()
    .sort(
      (a, b) =>
        editionOrder(editionMeta.get(a.edition_id)) -
        editionOrder(editionMeta.get(b.edition_id)),
    )
    .map((participant) => participant.qualified === true);

  const finalsFlags = opts.editions
    .slice()
    .sort(
      (a, b) =>
        (a.edition_number ?? Number.MAX_SAFE_INTEGER) -
        (b.edition_number ?? Number.MAX_SAFE_INTEGER),
    )
    .map((edition) =>
      myResults.some(
        (result) =>
          result.edition_id === edition.id &&
          showById.get(result.show_id ?? "")?.kind === "grand-final",
      ),
    );

  const bestPlacementStreak = longestStreak(top10Flags);
  const worstPlacementStreak = longestStreak(
    qualFlagsBySemi.map((qualifiedFlag) => !qualifiedFlag),
  );
  const consecutiveQualifications = currentStreak(qualFlagsBySemi);
  const consecutiveFinals = currentStreak(finalsFlags);
  const consecutiveTop10 = currentStreak(top10Flags);
  const consecutivePodiums = currentStreak(podiumFlags);

  const given = jury.filter((vote) => vote.voter_country_id === countryId);
  const received = jury.filter(
    (vote) => vote.receiving_country_id === countryId,
  );

  const givenTotals = new Map<string, number>();
  for (const vote of given) {
    givenTotals.set(
      vote.receiving_country_id,
      (givenTotals.get(vote.receiving_country_id) ?? 0) + vote.points,
    );
  }

  const receivedTotals = new Map<string, number>();
  for (const vote of received) {
    receivedTotals.set(
      vote.voter_country_id,
      (receivedTotals.get(vote.voter_country_id) ?? 0) + vote.points,
    );
  }

  const sortedGiven = [...givenTotals.entries()].sort((a, b) => b[1] - a[1]);

  const facedCountries = new Set<string>();
  for (const vote of jury) {
    if (
      vote.voter_country_id === countryId ||
      vote.receiving_country_id === countryId
    ) {
      facedCountries.add(vote.voter_country_id);
      facedCountries.add(vote.receiving_country_id);
    }
  }
  facedCountries.delete(countryId);

  const neverAwarded = [...facedCountries].filter((id) => !givenTotals.has(id));
  const neverVotedForThem = [...facedCountries].filter(
    (id) => !receivedTotals.has(id),
  );

  const topScoreGivenVotes = given.filter((vote) =>
    isTopScore(vote, resolveTop),
  );
  const topScoreReceivedVotes = received.filter((vote) =>
    isTopScore(vote, resolveTop),
  );

  const topGiveCount = new Map<string, number>();
  for (const vote of topScoreGivenVotes) {
    topGiveCount.set(
      vote.receiving_country_id,
      (topGiveCount.get(vote.receiving_country_id) ?? 0) + 1,
    );
  }

  const topReceiveCount = new Map<string, number>();
  for (const vote of topScoreReceivedVotes) {
    topReceiveCount.set(
      vote.voter_country_id,
      (topReceiveCount.get(vote.voter_country_id) ?? 0) + 1,
    );
  }

  const allTopScoresReceivedSorted = topScoreReceivedVotes
    .map((vote) => ({
      vote,
      editionNumber: editionMeta.get(vote.edition_id)?.editionNumber ?? null,
    }))
    .sort(
      (a, b) =>
        (a.editionNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.editionNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const firstTopScoreEntry = allTopScoresReceivedSorted[0];
  const latestTopScoreEntry =
    allTopScoresReceivedSorted[allTopScoresReceivedSorted.length - 1];

  const firstTopScore = firstTopScoreEntry
    ? {
        editionNumber: firstTopScoreEntry.editionNumber,
        from: firstTopScoreEntry.vote.voter_country_id,
        to: countryId,
      }
    : null;

  const latestTopScore = latestTopScoreEntry
    ? {
        editionNumber: latestTopScoreEntry.editionNumber,
        from: latestTopScoreEntry.vote.voter_country_id,
        to: countryId,
      }
    : null;

  const editionsSorted = opts.editions
    .slice()
    .sort(
      (a, b) =>
        (a.edition_number ?? Number.MAX_SAFE_INTEGER) -
        (b.edition_number ?? Number.MAX_SAFE_INTEGER),
    );

  const topScoreEditionIds = new Set(
    topScoreReceivedVotes.map((vote) => vote.edition_id),
  );

  let longestDrought = 0;
  let droughtRun = 0;

  for (const edition of editionsSorted) {
    const participated = myResults.some(
      (result) => result.edition_id === edition.id,
    );

    if (!participated) continue;

    if (topScoreEditionIds.has(edition.id)) {
      droughtRun = 0;
    } else {
      droughtRun += 1;
      longestDrought = Math.max(longestDrought, droughtRun);
    }
  }

  const distinctVoters = new Set(
    received.map((vote) => vote.voter_country_id),
  ).size;

  const scores = myResults.map((result) => result.total_points);

  return {
    countryId,
    participations: new Set(
      myParticipants.map((participant) => participant.edition_id),
    ).size,
    finals: finalsResults.length,
    semis: semiResults.length,
    qualifications: qualified.length,
    qualificationPct: semiParticipants.length
      ? (qualified.length / semiParticipants.length) * 100
      : null,
    grandFinalAppearancePct: myParticipants.length
      ? (finalsResults.length / myParticipants.length) * 100
      : null,
    wins,
    winPct: finalRanks.length ? (wins / finalRanks.length) * 100 : null,
    podiums,
    podiumPct: finalRanks.length ? (podiums / finalRanks.length) * 100 : null,
    top5,
    top5Pct: finalRanks.length ? (top5 / finalRanks.length) * 100 : null,
    top10,
    top10Pct: finalRanks.length ? (top10 / finalRanks.length) * 100 : null,
    lastPlaces,
    nilPointers,
    avgJuryPlacement: null,
    avgTelevotePlacement: null,
    avgCombinedPlacement: avg(finalRanks),
    avgPointsPerParticipation: avg(scores),
    avgPointsPerVoter: distinctVoters
      ? received.reduce((total, vote) => total + vote.points, 0) /
        distinctVoters
      : null,
    avgReceivedPerContest: avg(myResults.map((result) => result.total_points)),
    avgGivenPerContest: avg(
      [...new Set(given.map((vote) => vote.show_id))].map((showId) =>
        given
          .filter((vote) => vote.show_id === showId)
          .reduce((total, vote) => total + vote.points, 0),
      ),
    ),
    avgQualificationRank: null,
    highestScore: scores.length ? Math.max(...scores) : null,
    lowestScore: scores.length ? Math.min(...scores) : null,
    timeline,
    rolling5,
    biggestImprovement,
    biggestDecline,
    bestPlacementStreak,
    worstPlacementStreak,
    consecutiveQualifications,
    consecutiveFinals,
    consecutiveTop10,
    consecutivePodiums,
    favouriteRecipient: sortedGiven[0]
      ? { countryId: sortedGiven[0][0], points: sortedGiven[0][1] }
      : null,
    mostGenerousTowards: sortedGiven[0]
      ? { countryId: sortedGiven[0][0], points: sortedGiven[0][1] }
      : null,
    harshestTowards: sortedGiven[sortedGiven.length - 1]
      ? {
          countryId: sortedGiven[sortedGiven.length - 1][0],
          points: sortedGiven[sortedGiven.length - 1][1],
        }
      : null,
    distinctCountriesAwarded: givenTotals.size,
    neverAwarded,
    neverVotedForThem,
    neverVotedFor: neverVotedForThem,
    topScoresReceived: topScoreReceivedVotes.length,
    topScoresGiven: topScoreGivenVotes.length,
    topGiversOfTopScore: [...topReceiveCount.entries()]
      .map(([countryIdValue, count]) => ({
        countryId: countryIdValue,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topReceiversOfTopScore: [...topGiveCount.entries()]
      .map(([countryIdValue, count]) => ({
        countryId: countryIdValue,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    firstTopScore,
    latestTopScore,
    longestDroughtWithoutTopScore: longestDrought,
  };
}

/* ============================================================
   2. RELATIONSHIPS
   ============================================================ */

export type RelationshipTimelineEntry = {
  editionId: string;
  editionNumber: number | null;
  label: string;
  aToB: number;
  bToA: number;
};

export type CountryRelationship = {
  a: string;
  b: string;
  participationsTogether: number;
  totalAtoB: number;
  totalBtoA: number;
  avgAtoB: number | null;
  avgBtoA: number | null;
  juryAtoB: number;
  juryBtoA: number;
  televoteA: number;
  televoteB: number;
  mutualTopScores: number;
  timeline: RelationshipTimelineEntry[];
  biggestDisagreement:
    | {
        editionId: string;
        editionNumber: number | null;
        gap: number;
      }
    | null;
  similarity: number;
  rivalryScore: number;
  friendshipScore: number;
};

export function computeRelationship(
  a: string,
  b: string,
  opts: {
    editions: Edition[];
    jury: JuryVote[];
    results: ResultRow[];
    shows?: Show[];
  },
): CountryRelationship {
  const editionMeta = toEditionMeta(opts.editions);
  const jury = withVoterCountry(opts.jury);

  const aToB = jury.filter(
    (vote) =>
      vote.voter_country_id === a && vote.receiving_country_id === b,
  );

  const bToA = jury.filter(
    (vote) =>
      vote.voter_country_id === b && vote.receiving_country_id === a,
  );

  const editionIds = new Set<string>([
    ...aToB.map((vote) => vote.edition_id),
    ...bToA.map((vote) => vote.edition_id),
  ]);

  const timeline: RelationshipTimelineEntry[] = [...editionIds]
    .map((editionId) => {
      const meta = editionMeta.get(editionId);
      return {
        editionId,
        editionNumber: meta?.editionNumber ?? null,
        label: meta?.label ?? "Edition",
        aToB: aToB
          .filter((vote) => vote.edition_id === editionId)
          .reduce((total, vote) => total + vote.points, 0),
        bToA: bToA
          .filter((vote) => vote.edition_id === editionId)
          .reduce((total, vote) => total + vote.points, 0),
      };
    })
    .sort(
      (x, y) =>
        (x.editionNumber ?? Number.MAX_SAFE_INTEGER) -
        (y.editionNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const aEditionIds = new Set(
    opts.results
      .filter((result) => result.country_id === a)
      .map((result) => result.edition_id),
  );

  const participationsTogether = [...aEditionIds].filter((editionId) =>
    opts.results.some(
      (result) =>
        result.country_id === b && result.edition_id === editionId,
    ),
  ).length;

  let biggestDisagreement: CountryRelationship["biggestDisagreement"] = null;

  for (const point of timeline) {
    const gap = Math.abs(point.aToB - point.bToA);
    if (biggestDisagreement === null || gap > biggestDisagreement.gap) {
      biggestDisagreement = {
        editionId: point.editionId,
        editionNumber: point.editionNumber,
        gap,
      };
    }
  }

  const totalAtoB = aToB.reduce((total, vote) => total + vote.points, 0);
  const totalBtoA = bToA.reduce((total, vote) => total + vote.points, 0);
  const resolveTop = makeTopScoreResolver(opts.shows);

  const mutualTopScores = Math.min(
    aToB.filter((vote) => isTopScore(vote, resolveTop)).length,
    bToA.filter((vote) => isTopScore(vote, resolveTop)).length,
  );

  const vecA = new Map<string, number>();
  const vecB = new Map<string, number>();

  for (const vote of jury) {
    if (vote.voter_country_id === a) {
      vecA.set(
        vote.receiving_country_id,
        (vecA.get(vote.receiving_country_id) ?? 0) + vote.points,
      );
    }

    if (vote.voter_country_id === b) {
      vecB.set(
        vote.receiving_country_id,
        (vecB.get(vote.receiving_country_id) ?? 0) + vote.points,
      );
    }
  }

  const keys = new Set([...vecA.keys(), ...vecB.keys()]);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keys) {
    const x = vecA.get(key) ?? 0;
    const y = vecB.get(key) ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  const similarity = normA && normB ? dot / Math.sqrt(normA * normB) : 0;
  const avgGap =
    avg(timeline.map((point) => Math.abs(point.aToB - point.bToA))) ?? 0;
  const rivalryScore = timeline.length ? Math.max(0, 100 - avgGap * 5) : 0;
  const friendshipScore = timeline.length
    ? Math.min(100, ((totalAtoB + totalBtoA) / timeline.length / 24) * 100)
    : 0;

  return {
    a,
    b,
    participationsTogether,
    totalAtoB,
    totalBtoA,
    avgAtoB: aToB.length
      ? totalAtoB / new Set(aToB.map((vote) => vote.edition_id)).size
      : null,
    avgBtoA: bToA.length
      ? totalBtoA / new Set(bToA.map((vote) => vote.edition_id)).size
      : null,
    juryAtoB: totalAtoB,
    juryBtoA: totalBtoA,
    televoteA: 0,
    televoteB: 0,
    mutualTopScores,
    timeline,
    biggestDisagreement,
    similarity,
    rivalryScore,
    friendshipScore,
  };
}

/* ============================================================
   3. HEAD TO HEAD
   ============================================================ */

export type HeadToHeadRow = {
  editionId: string;
  editionNumber: number | null;
  label: string;
  aRank: number | null;
  bRank: number | null;
  diff: number | null;
};

export type HeadToHead = {
  a: string;
  b: string;
  sharedEditions: number;
  aWins: number;
  bWins: number;
  ties: number;
  avgDiff: number | null;
  closest: HeadToHeadRow | null;
  largest: HeadToHeadRow | null;
  rows: HeadToHeadRow[];
};

export function computeHeadToHead(
  a: string,
  b: string,
  opts: {
    editions: Edition[];
    results: ResultRow[];
  },
): HeadToHead {
  const editionMeta = toEditionMeta(opts.editions);
  const byEdition = new Map<
    string,
    {
      a?: ResultRow;
      b?: ResultRow;
    }
  >();

  for (const result of opts.results) {
    if (result.country_id !== a && result.country_id !== b) continue;

    const current = byEdition.get(result.edition_id) ?? {};
    if (result.country_id === a) current.a = result;
    else current.b = result;
    byEdition.set(result.edition_id, current);
  }

  const rows: HeadToHeadRow[] = [...byEdition.entries()]
    .filter(([, value]) => !!value.a && !!value.b)
    .map(([editionId, value]) => {
      const aRank = value.a!.final_rank;
      const bRank = value.b!.final_rank;
      const meta = editionMeta.get(editionId);

      return {
        editionId,
        editionNumber: meta?.editionNumber ?? null,
        label: meta?.label ?? "Edition",
        aRank,
        bRank,
        diff: aRank != null && bRank != null ? aRank - bRank : null,
      };
    })
    .sort(
      (x, y) =>
        (x.editionNumber ?? Number.MAX_SAFE_INTEGER) -
        (y.editionNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const aWins = rows.filter((row) => row.diff != null && row.diff < 0).length;
  const bWins = rows.filter((row) => row.diff != null && row.diff > 0).length;
  const ties = rows.filter((row) => row.diff === 0).length;

  const validDiffs = rows.filter(
    (row): row is HeadToHeadRow & { diff: number } => row.diff != null,
  );

  const closest = validDiffs.length
    ? validDiffs.reduce((previous, current) =>
        Math.abs(current.diff) < Math.abs(previous.diff) ? current : previous,
      )
    : null;

  const largest = validDiffs.length
    ? validDiffs.reduce((previous, current) =>
        Math.abs(current.diff) > Math.abs(previous.diff) ? current : previous,
      )
    : null;

  return {
    a,
    b,
    sharedEditions: rows.length,
    aWins,
    bWins,
    ties,
    avgDiff: avg(validDiffs.map((row) => Math.abs(row.diff))),
    closest,
    largest,
    rows,
  };
}

/* ============================================================
   4. CONTEST STATISTICS
   ============================================================ */

export type ContestStats = {
  showId: string;
  closestVictory:
    | { margin: number; winner: string; runnerUp: string }
    | null;
  biggestLandslide:
    | { margin: number; winner: string; runnerUp: string }
    | null;
  biggestTelevoteWinner: { countryId: string; points: number } | null;
  biggestJuryWinner: { countryId: string; points: number } | null;
  highestScoringDebut: { countryId: string; points: number } | null;
  largestRankingJump: { countryId: string; jump: number } | null;
  mostExchangedTopScores: { a: string; b: string; count: number } | null;
  strongestAlliance: { a: string; b: string; total: number } | null;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  unpredictabilityIndex: number | null;
};

export function computeContestStats(
  showId: string,
  opts: {
    results: ResultRow[];
    jury: JuryVote[];
    debutCountryIds?: Set<string>;
    shows?: Show[];
  },
): ContestStats {
  const rows = opts.results
    .filter((result) => result.show_id === showId)
    .sort(
      (a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999),
    );

  const jury = withVoterCountry(opts.jury).filter(
    (vote) => vote.show_id === showId,
  );

  if (!rows.length) {
    return {
      showId,
      closestVictory: null,
      biggestLandslide: null,
      biggestTelevoteWinner: null,
      biggestJuryWinner: null,
      highestScoringDebut: null,
      largestRankingJump: null,
      mostExchangedTopScores: null,
      strongestAlliance: null,
      averageScore: null,
      highestScore: null,
      lowestScore: null,
      unpredictabilityIndex: null,
    };
  }

  const winner = rows[0];
  const runnerUp = rows[1];
  const margin = runnerUp
    ? winner.total_points - runnerUp.total_points
    : null;

  const byTelevote = [...rows].sort(
    (a, b) => b.televote_points - a.televote_points,
  )[0];
  const byJury = [...rows].sort(
    (a, b) => b.jury_points - a.jury_points,
  )[0];

  const debutRows = opts.debutCountryIds
    ? rows.filter((result) => opts.debutCountryIds!.has(result.country_id))
    : [];
  const highestDebut = debutRows.length
    ? [...debutRows].sort((a, b) => b.total_points - a.total_points)[0]
    : null;

  const juryRank = new Map(
    [...rows]
      .sort((a, b) => b.jury_points - a.jury_points)
      .map((result, index) => [result.country_id, index + 1]),
  );

  const teleRank = new Map(
    [...rows]
      .sort((a, b) => b.televote_points - a.televote_points)
      .map((result, index) => [result.country_id, index + 1]),
  );

  let largestJump: ContestStats["largestRankingJump"] = null;

  for (const result of rows) {
    const juryPosition = juryRank.get(result.country_id) ?? 0;
    const televotePosition = teleRank.get(result.country_id) ?? 0;
    const jump = juryPosition - televotePosition;

    if (largestJump === null || Math.abs(jump) > Math.abs(largestJump.jump)) {
      largestJump = { countryId: result.country_id, jump };
    }
  }

  const resolveTop = makeTopScoreResolver(opts.shows);
  const pairTotals = new Map<
    string,
    { a: string; b: string; total: number; topScores: number }
  >();

  for (const vote of jury) {
    const key = [vote.voter_country_id, vote.receiving_country_id]
      .sort()
      .join("|");

    const current = pairTotals.get(key) ?? {
      a: vote.voter_country_id,
      b: vote.receiving_country_id,
      total: 0,
      topScores: 0,
    };

    current.total += vote.points;
    if (isTopScore(vote, resolveTop)) current.topScores += 1;
    pairTotals.set(key, current);
  }

  const byTopScores = [...pairTotals.values()].sort(
    (a, b) => b.topScores - a.topScores,
  )[0];

  const byAlliance = [...pairTotals.values()].sort(
    (a, b) => b.total - a.total,
  )[0];

  const scores = rows.map((result) => result.total_points);
  const diffs = rows.map((result) =>
    Math.abs(
      (juryRank.get(result.country_id) ?? 0) -
        (teleRank.get(result.country_id) ?? 0),
    ),
  );

  return {
    showId,
    closestVictory:
      margin != null && runnerUp
        ? {
            margin,
            winner: winner.country_id,
            runnerUp: runnerUp.country_id,
          }
        : null,
    biggestLandslide:
      margin != null && runnerUp
        ? {
            margin,
            winner: winner.country_id,
            runnerUp: runnerUp.country_id,
          }
        : null,
    biggestTelevoteWinner: byTelevote
      ? { countryId: byTelevote.country_id, points: byTelevote.televote_points }
      : null,
    biggestJuryWinner: byJury
      ? { countryId: byJury.country_id, points: byJury.jury_points }
      : null,
    highestScoringDebut: highestDebut
      ? { countryId: highestDebut.country_id, points: highestDebut.total_points }
      : null,
    largestRankingJump: largestJump,
    mostExchangedTopScores: byTopScores
      ? { a: byTopScores.a, b: byTopScores.b, count: byTopScores.topScores }
      : null,
    strongestAlliance: byAlliance
      ? { a: byAlliance.a, b: byAlliance.b, total: byAlliance.total }
      : null,
    averageScore: avg(scores),
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    unpredictabilityIndex: avg(diffs),
  };
}

/* ============================================================
   5. HISTORICAL RECORDS
   ============================================================ */

export type HistoricalRecordEntry = {
  label: string;
  value: string;
  detail: string;
};

export function computeHistoricalRecords(opts: {
  countries: Country[];
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
}): HistoricalRecordEntry[] {
  const countryName = new Map(
    opts.countries.map((country) => [country.id, country.name]),
  );
  const editionMeta = toEditionMeta(opts.editions);
  const showById = new Map(opts.shows.map((show) => [show.id, show]));
  const finalResults = opts.results.filter(
    (result) =>
      showById.get(result.show_id ?? "")?.kind === "grand-final",
  );

  const byCountry = new Map<string, ResultRow[]>();
  for (const result of opts.results) {
    byCountry.set(result.country_id, [
      ...(byCountry.get(result.country_id) ?? []),
      result,
    ]);
  }

  const output: HistoricalRecordEntry[] = [];
  const push = (label: string, value: string, detail: string) => {
    output.push({ label, value, detail });
  };

  const partEditions = new Map<string, Set<string>>();
  for (const participant of opts.participants) {
    const set = partEditions.get(participant.country_id) ?? new Set<string>();
    set.add(participant.edition_id);
    partEditions.set(participant.country_id, set);
  }

  const topParts = [...partEditions.entries()]
    .map(([id, set]) => [id, set.size] as const)
    .sort((a, b) => b[1] - a[1])[0];

  if (topParts) {
    push(
      "Most participations",
      String(topParts[1]),
      countryName.get(topParts[0]) ?? "?",
    );
  }

  const semiParts = opts.participants.filter(
    (participant) =>
      showById.get(participant.show_id ?? "")?.kind === "semi-final",
  );

  const byCountrySemis = new Map<string, Participant[]>();
  for (const participant of semiParts) {
    byCountrySemis.set(participant.country_id, [
      ...(byCountrySemis.get(participant.country_id) ?? []),
      participant,
    ]);
  }

  let bestQualStreak = { id: "", n: 0 };
  let bestNonQualStreak = { id: "", n: 0 };

  for (const [id, rows] of byCountrySemis.entries()) {
    const sorted = rows.slice().sort(
      (a, b) =>
        editionOrder(editionMeta.get(a.edition_id)) -
        editionOrder(editionMeta.get(b.edition_id)),
    );

    const qualStreak = longestStreak(
      sorted.map((row) => row.qualified === true),
    );
    const nonQualStreak = longestStreak(
      sorted.map((row) => row.qualified === false),
    );

    if (qualStreak > bestQualStreak.n) {
      bestQualStreak = { id, n: qualStreak };
    }

    if (nonQualStreak > bestNonQualStreak.n) {
      bestNonQualStreak = { id, n: nonQualStreak };
    }
  }

  if (bestQualStreak.n) {
    push(
      "Longest qualification streak",
      String(bestQualStreak.n),
      countryName.get(bestQualStreak.id) ?? "?",
    );
  }

  if (bestNonQualStreak.n) {
    push(
      "Longest non-qualification streak",
      String(bestNonQualStreak.n),
      countryName.get(bestNonQualStreak.id) ?? "?",
    );
  }

  let bestWinStreak = { id: "", n: 0 };
  let bestTop10Streak = { id: "", n: 0 };
  let longestWinDrought = { id: "", n: 0 };

  for (const [id, rows] of byCountry.entries()) {
    const finals = rows
      .filter(
        (result) =>
          showById.get(result.show_id ?? "")?.kind === "grand-final",
      )
      .sort(
        (a, b) =>
          editionOrder(editionMeta.get(a.edition_id)) -
          editionOrder(editionMeta.get(b.edition_id)),
      );

    const winFlags = finals.map((result) => result.final_rank === 1);
    const top10Flags = finals.map(
      (result) => result.final_rank != null && result.final_rank <= 10,
    );

    const winStreak = longestStreak(winFlags);
    const top10Streak = longestStreak(top10Flags);

    if (winStreak > bestWinStreak.n) {
      bestWinStreak = { id, n: winStreak };
    }

    if (top10Streak > bestTop10Streak.n) {
      bestTop10Streak = { id, n: top10Streak };
    }

    if (winFlags.some(Boolean)) {
      let run = 0;
      let maxRun = 0;
      let started = false;

      for (const won of winFlags) {
        if (won) {
          started = true;
          run = 0;
        } else if (started) {
          run += 1;
          maxRun = Math.max(maxRun, run);
        }
      }

      if (maxRun > longestWinDrought.n) {
        longestWinDrought = { id, n: maxRun };
      }
    }
  }

  if (bestWinStreak.n) {
    push(
      "Most consecutive wins",
      String(bestWinStreak.n),
      countryName.get(bestWinStreak.id) ?? "?",
    );
  }

  if (bestTop10Streak.n) {
    push(
      "Most consecutive top-10 finishes",
      String(bestTop10Streak.n),
      countryName.get(bestTop10Streak.id) ?? "?",
    );
  }

  if (longestWinDrought.n) {
    push(
      "Longest win drought",
      `${longestWinDrought.n} editions`,
      countryName.get(longestWinDrought.id) ?? "?",
    );
  }

  if (finalResults.length) {
    const top = [...finalResults].sort(
      (a, b) => b.total_points - a.total_points,
    )[0];

    push(
      "Most points in one edition",
      String(top.total_points),
      `${countryName.get(top.country_id) ?? "?"} · ${
        editionMeta.get(top.edition_id)?.label ?? "Edition"
      }`,
    );

    const showRows = new Map<string, ResultRow[]>();
    for (const result of finalResults) {
      const key = result.show_id ?? `edition:${result.edition_id}`;
      showRows.set(key, [...(showRows.get(key) ?? []), result]);
    }

    const rankWithin = (
      rows: ResultRow[],
      value: (row: ResultRow) => number,
    ): Map<string, number> => {
      const sorted = [...rows].sort((a, b) => value(b) - value(a));
      const ranks = new Map<string, number>();

      for (let index = 0; index < sorted.length; index += 1) {
        const result = sorted[index];
        const previous = sorted[index - 1];

        if (previous && value(previous) === value(result)) {
          ranks.set(
            result.country_id,
            ranks.get(previous.country_id) ?? index + 1,
          );
        } else {
          ranks.set(result.country_id, index + 1);
        }
      }

      return ranks;
    };

    let bestClimb: { places: number; row: ResultRow } | null = null;
    let worstDrop: { places: number; row: ResultRow } | null = null;

    for (const rows of showRows.values()) {
      if (rows.length < 2) continue;

      const juryRank = rankWithin(rows, (row) => row.jury_points);
      const finalRank = rankWithin(rows, (row) => row.total_points);

      for (const row of rows) {
        const juryPosition = juryRank.get(row.country_id);
        const finalPosition = finalRank.get(row.country_id);

        if (juryPosition == null || finalPosition == null) continue;

        const moved = juryPosition - finalPosition;

        if (
          moved > 0 &&
          (bestClimb === null || moved > bestClimb.places)
        ) {
          bestClimb = { places: moved, row };
        }

        if (
          moved < 0 &&
          (worstDrop === null || -moved > worstDrop.places)
        ) {
          worstDrop = { places: -moved, row };
        }
      }
    }

    if (worstDrop !== null) {
      push(
        "Biggest collapse (places lost after the jury vote)",
        `-${worstDrop.places}`,
        `${countryName.get(worstDrop.row.country_id) ?? "?"} · ${
          editionMeta.get(worstDrop.row.edition_id)?.label ?? "Edition"
        }`,
      );
    }

    if (bestClimb !== null) {
      push(
        "Biggest comeback (places gained after the jury vote)",
        `+${bestClimb.places}`,
        `${countryName.get(bestClimb.row.country_id) ?? "?"} · ${
          editionMeta.get(bestClimb.row.edition_id)?.label ?? "Edition"
        }`,
      );
    }
  }

  const winnersByEdition = new Map<string, string>();
  for (const result of finalResults) {
    if (result.final_rank === 1) {
      winnersByEdition.set(result.edition_id, result.country_id);
    }
  }

  const defeatedWinners = new Map<string, Set<string>>();
  for (const result of finalResults) {
    const winner = winnersByEdition.get(result.edition_id);
    if (!winner || winner === result.country_id) continue;

    const set = defeatedWinners.get(result.country_id) ?? new Set<string>();
    set.add(winner);
    defeatedWinners.set(result.country_id, set);
  }

  let mostDefeated = { id: "", n: 0 };
  for (const [id, set] of defeatedWinners.entries()) {
    if (set.size > mostDefeated.n) {
      mostDefeated = { id, n: set.size };
    }
  }

  if (mostDefeated.n) {
    push(
      "Most different winners finished below",
      String(mostDefeated.n),
      countryName.get(mostDefeated.id) ?? "?",
    );
  }

  return output;
}

/* ============================================================
   6. VOTING INTELLIGENCE
   ============================================================ */

export type Kingmaker = {
  countryId: string;
  influenceScore: number;
};

export type VotingIntelligence = {
  kingmakers: Kingmaker[];
  voteVolatility: Array<{ countryId: string; stdDev: number }>;
  predictability: Array<{ countryId: string; score: number }>;
  loyaltyScore: Array<{ countryId: string; score: number }>;
  diversityScore: Array<{ countryId: string; score: number }>;
  strategicVotingIndex: Array<{ countryId: string; score: number }>;
  regionalDependence: Array<{ countryId: string; share: number }>;
  juryPublicDisagreement: number | null;
};

export function computeVotingIntelligence(opts: {
  countries: Country[];
  jury: JuryVote[];
  results: ResultRow[];
}): VotingIntelligence {
  const jury = withVoterCountry(opts.jury);
  const region = new Map(
    opts.countries.map((country) => [country.id, country.region]),
  );

  const winnersByEdition = new Map<string, string>();
  for (const result of opts.results) {
    if (result.final_rank === 1) {
      winnersByEdition.set(result.edition_id, result.country_id);
    }
  }

  const kingmakerScore = new Map<
    string,
    { given: number; toWinner: number }
  >();

  for (const vote of jury) {
    const current = kingmakerScore.get(vote.voter_country_id) ?? {
      given: 0,
      toWinner: 0,
    };

    current.given += vote.points;
    if (
      winnersByEdition.get(vote.edition_id) === vote.receiving_country_id
    ) {
      current.toWinner += vote.points;
    }
    kingmakerScore.set(vote.voter_country_id, current);
  }

  const kingmakers: Kingmaker[] = [...kingmakerScore.entries()]
    .map(([countryId, values]) => ({
      countryId,
      influenceScore: values.given
        ? (values.toWinner / values.given) * 100
        : 0,
    }))
    .sort((a, b) => b.influenceScore - a.influenceScore);

  const byCountryEdition = new Map<string, Map<string, number>>();
  for (const vote of jury) {
    const map = byCountryEdition.get(vote.voter_country_id) ?? new Map();
    map.set(
      vote.edition_id,
      (map.get(vote.edition_id) ?? 0) + vote.points,
    );
    byCountryEdition.set(vote.voter_country_id, map);
  }

  const voteVolatility: Array<{ countryId: string; stdDev: number }> = [];

  for (const [countryId, map] of byCountryEdition.entries()) {
    const values = [...map.values()];
    const mean = avg(values) ?? 0;
    const variance = values.length
      ? values.reduce((total, value) => total + (value - mean) ** 2, 0) /
        values.length
      : 0;

    voteVolatility.push({ countryId, stdDev: Math.sqrt(variance) });
  }

  voteVolatility.sort((a, b) => b.stdDev - a.stdDev);
  const maxStd = Math.max(1, ...voteVolatility.map((value) => value.stdDev));

  const predictability = voteVolatility.map((value) => ({
    countryId: value.countryId,
    score: 100 - (value.stdDev / maxStd) * 100,
  }));

  const loyaltyScore: Array<{ countryId: string; score: number }> = [];
  const diversityScore: Array<{ countryId: string; score: number }> = [];
  const byCountry = new Map<string, Array<JuryVote & { voter_country_id: string }>>();

  for (const vote of jury) {
    byCountry.set(vote.voter_country_id, [
      ...(byCountry.get(vote.voter_country_id) ?? []),
      vote,
    ]);
  }

  for (const [countryId, votes] of byCountry.entries()) {
    const recipientTotals = new Map<string, number>();
    for (const vote of votes) {
      recipientTotals.set(
        vote.receiving_country_id,
        (recipientTotals.get(vote.receiving_country_id) ?? 0) + vote.points,
      );
    }

    const total = votes.reduce((sum, vote) => sum + vote.points, 0);
    const top = Math.max(0, ...recipientTotals.values());

    loyaltyScore.push({
      countryId,
      score: total ? (top / total) * 100 : 0,
    });

    const editionsVoted = new Set(votes.map((vote) => vote.edition_id)).size;
    diversityScore.push({
      countryId,
      score: editionsVoted ? recipientTotals.size / editionsVoted : 0,
    });
  }

  loyaltyScore.sort((a, b) => b.score - a.score);
  diversityScore.sort((a, b) => b.score - a.score);

  const regionalDependence: Array<{ countryId: string; share: number }> = [];

  for (const [countryId, votes] of byCountry.entries()) {
    const total = votes.reduce((sum, vote) => sum + vote.points, 0);
    const inRegion = votes
      .filter(
        (vote) =>
          region.get(vote.voter_country_id) ===
          region.get(vote.receiving_country_id),
      )
      .reduce((sum, vote) => sum + vote.points, 0);

    regionalDependence.push({
      countryId,
      share: total ? (inRegion / total) * 100 : 0,
    });
  }

  regionalDependence.sort((a, b) => b.share - a.share);

  const strategicVotingIndex = regionalDependence.map((row) => ({
    countryId: row.countryId,
    score: row.share,
  }));

  const byShow = new Map<string, ResultRow[]>();
  for (const result of opts.results) {
    const key = result.show_id ?? "";
    byShow.set(key, [...(byShow.get(key) ?? []), result]);
  }

  const differences: number[] = [];

  for (const rows of byShow.values()) {
    if (rows.length < 2) continue;

    const juryRank = new Map(
      [...rows]
        .sort((a, b) => b.jury_points - a.jury_points)
        .map((result, index) => [result.country_id, index + 1]),
    );

    const teleRank = new Map(
      [...rows]
        .sort((a, b) => b.televote_points - a.televote_points)
        .map((result, index) => [result.country_id, index + 1]),
    );

    for (const result of rows) {
      differences.push(
        Math.abs(
          (juryRank.get(result.country_id) ?? 0) -
            (teleRank.get(result.country_id) ?? 0),
        ),
      );
    }
  }

  return {
    kingmakers: kingmakers.slice(0, 15),
    voteVolatility: voteVolatility.slice(0, 15),
    predictability: predictability
      .sort((a, b) => b.score - a.score)
      .slice(0, 15),
    loyaltyScore: loyaltyScore.slice(0, 15),
    diversityScore: diversityScore.slice(0, 15),
    strategicVotingIndex: strategicVotingIndex.slice(0, 15),
    regionalDependence: regionalDependence.slice(0, 15),
    juryPublicDisagreement: avg(differences),
  };
}

/* ============================================================
   POINT FLOW / HEATMAP
   ============================================================ */

export type PointFlowLink = {
  source: string;
  target: string;
  value: number;
};

export function buildPointFlow(
  jury: JuryVote[],
  minValue = 1,
): PointFlowLink[] {
  const votes = withVoterCountry(jury);
  const map = new Map<string, number>();

  for (const vote of votes) {
    const key = `${vote.voter_country_id}>${vote.receiving_country_id}`;
    map.set(key, (map.get(key) ?? 0) + vote.points);
  }

  return [...map.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split(">");
      return { source, target, value };
    })
    .filter((link) => link.value >= minValue)
    .sort((a, b) => b.value - a.value);
}

export function buildHeatmapMatrix(countries: Country[], jury: JuryVote[]) {
  const votes = withVoterCountry(jury);
  const ids = countries.map((country) => country.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const matrix = ids.map(() => ids.map(() => 0));

  for (const vote of votes) {
    const i = index.get(vote.voter_country_id);
    const j = index.get(vote.receiving_country_id);

    if (i == null || j == null) continue;
    matrix[i][j] += vote.points;
  }

  return { ids, matrix };
}
