/**
 * Advanced statistics & analytics engine.
 * Pure computation functions — no React, no side effects.
 * Consumes the raw rows exposed by src/lib/data.ts.
 */
import type { Country, Edition, JuryVote, Participant, ResultRow, Show, Televote } from "./data";
import { isTopScore, makeTopScoreResolver } from "./voting";

/* ============================================================ helpers */

export type EditionMeta = { id: string; year: number | null; label: string };

export function toEditionMeta(editions: Edition[]): Map<string, EditionMeta> {
  const m = new Map<string, EditionMeta>();
  editions.forEach((e) =>
    m.set(e.id, { id: e.id, year: e.year, label: e.edition_number ? `SSC ${e.edition_number}` : e.name }),
  );
  return m;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const finiteRanks = (rows: ResultRow[]) => rows.map((r) => r.final_rank).filter((r): r is number => r != null);

/** Defensive: some jury_votes rows may have no voter_country_id (custom voter panels). */
function withVoterCountry(jury: JuryVote[]) {
  return jury.filter((v): v is JuryVote & { voter_country_id: string } => !!v.voter_country_id);
}

function longestStreak(bools: boolean[]): number {
  let best = 0;
  let cur = 0;
  for (const b of bools) {
    cur = b ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

function currentStreak(bools: boolean[]): number {
  let cur = 0;
  for (let i = bools.length - 1; i >= 0; i--) {
    if (bools[i]) cur++;
    else break;
  }
  return cur;
}

/* ============================================================ 1) COUNTRY STATISTICS */

export type CountryTimelinePoint = {
  editionId: string;
  year: number | null;
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
  rolling5: { editionId: string; year: number | null; avgPlacement: number | null }[];
  biggestImprovement: { fromYear: number | null; toYear: number | null; delta: number } | null;
  biggestDecline: { fromYear: number | null; toYear: number | null; delta: number } | null;
  bestPlacementStreak: number; // longest run of top-10 finishes
  worstPlacementStreak: number; // longest run of non-qualifications
  consecutiveQualifications: number; // current streak
  consecutiveFinals: number;
  consecutiveTop10: number;
  consecutivePodiums: number;
  favouriteRecipient: { countryId: string; points: number } | null;
  mostGenerousTowards: { countryId: string; points: number } | null;
  harshestTowards: { countryId: string; points: number } | null;
  distinctCountriesAwarded: number;
  neverAwarded: string[]; // country ids this country never gave points to (out of countries it faced)
  neverVotedForThem: string[]; // country ids that never gave points to this country
  neverVotedFor: string[]; // countries this country never received votes from among those it could vote for it self excluded — same as above alias
  topScoresReceived: number;
  topScoresGiven: number;
  topGiversOfTopScore: { countryId: string; count: number }[];
  topReceiversOfTopScore: { countryId: string; count: number }[];
  firstTopScore: { year: number | null; from: string; to: string } | null;
  latestTopScore: { year: number | null; from: string; to: string } | null;
  longestDroughtWithoutTopScore: number; // editions
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
  const showById = new Map(opts.shows.map((s) => [s.id, s]));
  const jury = withVoterCountry(opts.jury);
  const resolveTop = makeTopScoreResolver(opts.shows);

  const myResults = opts.results.filter((r) => r.country_id === countryId);
  const myParticipants = opts.participants.filter((p) => p.country_id === countryId);

  const finalsResults = myResults.filter((r) => {
    const s = r.show_id ? showById.get(r.show_id) : null;
    return s?.kind === "grand-final";
  });
  const semiResults = myResults.filter((r) => {
    const s = r.show_id ? showById.get(r.show_id) : null;
    return s?.kind === "semi-final";
  });

  const semiParticipants = myParticipants.filter((p) => {
    const s = p.show_id ? showById.get(p.show_id) : null;
    return s?.kind === "semi-final";
  });
  const qualified = semiParticipants.filter((p) => p.qualified === true);

  const finalRanks = finiteRanks(finalsResults);
  const wins = finalRanks.filter((r) => r === 1).length;
  const podiums = finalRanks.filter((r) => r <= 3).length;
  const top5 = finalRanks.filter((r) => r <= 5).length;
  const top10 = finalRanks.filter((r) => r <= 10).length;

  const lastPlaces = finalsResults.filter((r) => {
    const showFinalists = opts.results.filter((rr) => rr.show_id === r.show_id);
    const maxRank = Math.max(0, ...finiteRanks(showFinalists));
    return r.final_rank != null && r.final_rank === maxRank;
  }).length;

  const nilPointers = myResults.filter((r) => r.total_points === 0).length;

  const timeline: CountryTimelinePoint[] = myResults
    .map((r) => {
      const meta = editionMeta.get(r.edition_id);
      const p = myParticipants.find((pp) => pp.show_id === r.show_id);
      return {
        editionId: r.edition_id,
        year: meta?.year ?? null,
        label: meta?.label ?? "?",
        showId: r.show_id,
        jury: r.jury_points,
        televote: r.televote_points,
        total: r.total_points,
        rank: r.final_rank,
        qualified: p?.qualified ?? null,
      };
    })
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  const finalTimeline = timeline.filter((t) => showById.get(t.showId ?? "")?.kind === "grand-final");

  const rolling5 = finalTimeline.map((_, i) => {
    const window = finalTimeline.slice(Math.max(0, i - 4), i + 1);
    const ranks = window.map((w) => w.rank).filter((r): r is number => r != null);
    return { editionId: finalTimeline[i].editionId, year: finalTimeline[i].year, avgPlacement: avg(ranks) };
  });

  let biggestImprovement: CountryStats["biggestImprovement"] = null;
  let biggestDecline: CountryStats["biggestDecline"] = null;
  for (let i = 1; i < finalTimeline.length; i++) {
    const prev = finalTimeline[i - 1];
    const cur = finalTimeline[i];
    if (prev.rank == null || cur.rank == null) continue;
    const delta = prev.rank - cur.rank; // positive = improvement (lower rank number)
    if (delta > 0 && (!biggestImprovement || delta > biggestImprovement.delta))
      biggestImprovement = { fromYear: prev.year, toYear: cur.year, delta };
    if (delta < 0 && (!biggestDecline || delta < biggestDecline.delta))
      biggestDecline = { fromYear: prev.year, toYear: cur.year, delta };
  }

  const top10Flags = finalTimeline.map((t) => t.rank != null && t.rank <= 10);
  const podiumFlags = finalTimeline.map((t) => t.rank != null && t.rank <= 3);
  const qualFlagsBySemi = semiParticipants
    .slice()
    .sort((a, b) => {
      const ea = editionMeta.get(a.edition_id)?.year ?? 0;
      const eb = editionMeta.get(b.edition_id)?.year ?? 0;
      return ea - eb;
    })
    .map((p) => p.qualified === true);
  const finalsFlags = opts.editions
    .slice()
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    .map((e) => myResults.some((r) => r.edition_id === e.id && showById.get(r.show_id ?? "")?.kind === "grand-final"));

  const bestPlacementStreak = longestStreak(top10Flags);
  const worstPlacementStreak = longestStreak(qualFlagsBySemi.map((q) => !q));
  const consecutiveQualifications = currentStreak(qualFlagsBySemi);
  const consecutiveFinals = currentStreak(finalsFlags);
  const consecutiveTop10 = currentStreak(top10Flags);
  const consecutivePodiums = currentStreak(podiumFlags);

  // voting behaviour
  const given = jury.filter((v) => v.voter_country_id === countryId);
  const received = jury.filter((v) => v.receiving_country_id === countryId);

  const givenTotals = new Map<string, number>();
  given.forEach((v) => givenTotals.set(v.receiving_country_id, (givenTotals.get(v.receiving_country_id) ?? 0) + v.points));
  const receivedTotals = new Map<string, number>();
  received.forEach((v) => receivedTotals.set(v.voter_country_id, (receivedTotals.get(v.voter_country_id) ?? 0) + v.points));

  const sortedGiven = [...givenTotals.entries()].sort((a, b) => b[1] - a[1]);
  const sortedReceived = [...receivedTotals.entries()].sort((a, b) => b[1] - a[1]);

  const facedCountries = new Set<string>([
    ...jury.filter((v) => v.voter_country_id === countryId || v.receiving_country_id === countryId).map((v) => v.voter_country_id),
    ...jury.filter((v) => v.voter_country_id === countryId || v.receiving_country_id === countryId).map((v) => v.receiving_country_id),
  ]);
  facedCountries.delete(countryId);
  const neverAwarded = [...facedCountries].filter((id) => !givenTotals.has(id));
  const neverVotedForThem = [...facedCountries].filter((id) => !receivedTotals.has(id));

  const topScoreGivenVotes = given.filter((v) => isTopScore(v, resolveTop));
  const topScoreReceivedVotes = received.filter((v) => isTopScore(v, resolveTop));

  const topGiveCount = new Map<string, number>();
  topScoreGivenVotes.forEach((v) => topGiveCount.set(v.receiving_country_id, (topGiveCount.get(v.receiving_country_id) ?? 0) + 1));
  const topReceiveCount = new Map<string, number>();
  topScoreReceivedVotes.forEach((v) => topReceiveCount.set(v.voter_country_id, (topReceiveCount.get(v.voter_country_id) ?? 0) + 1));

  const allTopScoresReceivedSorted = topScoreReceivedVotes
    .map((v) => ({ v, year: editionMeta.get(v.edition_id)?.year ?? null }))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const firstTopScore = allTopScoresReceivedSorted[0]
    ? { year: allTopScoresReceivedSorted[0].year, from: allTopScoresReceivedSorted[0].v.voter_country_id, to: countryId }
    : null;
  const latestTopScore = allTopScoresReceivedSorted.length
    ? {
        year: allTopScoresReceivedSorted[allTopScoresReceivedSorted.length - 1].year,
        from: allTopScoresReceivedSorted[allTopScoresReceivedSorted.length - 1].v.voter_country_id,
        to: countryId,
      }
    : null;

  const editionsSortedByYear = opts.editions.slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const topScoreEditionIds = new Set(topScoreReceivedVotes.map((v) => v.edition_id));
  let longestDrought = 0;
  let run = 0;
  editionsSortedByYear.forEach((e) => {
    const participated = myResults.some((r) => r.edition_id === e.id);
    if (!participated) return;
    if (topScoreEditionIds.has(e.id)) {
      run = 0;
    } else {
      run++;
      longestDrought = Math.max(longestDrought, run);
    }
  });

  const distinctVoters = new Set(received.map((v) => v.voter_country_id)).size;
  const scores = myResults.map((r) => r.total_points);

  return {
    countryId,
    participations: new Set(myParticipants.map((p) => p.edition_id)).size,
    finals: finalsResults.length,
    semis: semiResults.length,
    qualifications: qualified.length,
    qualificationPct: semiParticipants.length ? (qualified.length / semiParticipants.length) * 100 : null,
    grandFinalAppearancePct: myParticipants.length ? (finalsResults.length / myParticipants.length) * 100 : null,
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
    avgPointsPerVoter: distinctVoters ? received.reduce((a, v) => a + v.points, 0) / distinctVoters : null,
    avgReceivedPerContest: avg(myResults.map((r) => r.total_points)),
    avgGivenPerContest: avg(
      [...new Set(given.map((v) => v.show_id))].map(
        (showId) => given.filter((v) => v.show_id === showId).reduce((a, v) => a + v.points, 0),
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
    favouriteRecipient: sortedGiven[0] ? { countryId: sortedGiven[0][0], points: sortedGiven[0][1] } : null,
    mostGenerousTowards: sortedGiven[0] ? { countryId: sortedGiven[0][0], points: sortedGiven[0][1] } : null,
    harshestTowards: sortedGiven[sortedGiven.length - 1]
      ? { countryId: sortedGiven[sortedGiven.length - 1][0], points: sortedGiven[sortedGiven.length - 1][1] }
      : null,
    distinctCountriesAwarded: givenTotals.size,
    neverAwarded,
    neverVotedForThem,
    neverVotedFor: neverVotedForThem,
    topScoresReceived: topScoreReceivedVotes.length,
    topScoresGiven: topScoreGivenVotes.length,
    topGiversOfTopScore: [...topReceiveCount.entries()]
      .map(([countryId, count]) => ({ countryId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topReceiversOfTopScore: [...topGiveCount.entries()]
      .map(([countryId, count]) => ({ countryId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    firstTopScore,
    latestTopScore,
    longestDroughtWithoutTopScore: longestDrought,
  };
}

/* ============================================================ 2) RELATIONSHIPS */

export type RelationshipTimelineEntry = {
  editionId: string;
  year: number | null;
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
  televoteA: number; // not exchanged directly, informational
  televoteB: number;
  mutualTopScores: number;
  timeline: RelationshipTimelineEntry[];
  biggestDisagreement: { editionId: string; year: number | null; gap: number } | null;
  similarity: number; // 0..1 cosine similarity of voting vectors
  rivalryScore: number; // frequency of close head-to-head finishes + one-sidedness
  friendshipScore: number; // mutual high exchange
};

export function computeRelationship(
  a: string,
  b: string,
  opts: { editions: Edition[]; jury: JuryVote[]; results: ResultRow[]; shows?: Show[] },
): CountryRelationship {
  const editionMeta = toEditionMeta(opts.editions);
  const jury = withVoterCountry(opts.jury);
  const aToB = jury.filter((v) => v.voter_country_id === a && v.receiving_country_id === b);
  const bToA = jury.filter((v) => v.voter_country_id === b && v.receiving_country_id === a);

  const editionIds = new Set([...aToB.map((v) => v.edition_id), ...bToA.map((v) => v.edition_id)]);
  const timeline: RelationshipTimelineEntry[] = [...editionIds]
    .map((editionId) => ({
      editionId,
      year: editionMeta.get(editionId)?.year ?? null,
      aToB: aToB.filter((v) => v.edition_id === editionId).reduce((s, v) => s + v.points, 0),
      bToA: bToA.filter((v) => v.edition_id === editionId).reduce((s, v) => s + v.points, 0),
    }))
    .sort((x, y) => (x.year ?? 0) - (y.year ?? 0));

  const participationsTogether = new Set([
    ...opts.results.filter((r) => r.country_id === a).map((r) => r.edition_id),
  ].filter((id) => opts.results.some((r) => r.country_id === b && r.edition_id === id))).size;

  let biggestDisagreement: CountryRelationship["biggestDisagreement"] = null;
  timeline.forEach((t) => {
    const gap = Math.abs(t.aToB - t.bToA);
    if (!biggestDisagreement || gap > biggestDisagreement.gap)
      biggestDisagreement = { editionId: t.editionId, year: t.year, gap };
  });

  const totalAtoB = aToB.reduce((s, v) => s + v.points, 0);
  const totalBtoA = bToA.reduce((s, v) => s + v.points, 0);
  const resolveTop = makeTopScoreResolver(opts.shows);
  const mutualTopScores = Math.min(
    aToB.filter((v) => isTopScore(v, resolveTop)).length,
    bToA.filter((v) => isTopScore(v, resolveTop)).length,
  );

  // similarity: compare each country's outgoing voting vector across all other recipients
  const vecA = new Map<string, number>();
  const vecB = new Map<string, number>();
  jury.filter((v) => v.voter_country_id === a).forEach((v) => vecA.set(v.receiving_country_id, (vecA.get(v.receiving_country_id) ?? 0) + v.points));
  jury.filter((v) => v.voter_country_id === b).forEach((v) => vecB.set(v.receiving_country_id, (vecB.get(v.receiving_country_id) ?? 0) + v.points));
  const keys = new Set([...vecA.keys(), ...vecB.keys()]);
  let dot = 0, na = 0, nb = 0;
  keys.forEach((k) => {
    const x = vecA.get(k) ?? 0;
    const y = vecB.get(k) ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  });
  const similarity = na && nb ? dot / Math.sqrt(na * nb) : 0;

  const avgGap = avg(timeline.map((t) => Math.abs(t.aToB - t.bToA))) ?? 0;
  const rivalryScore = timeline.length ? Math.max(0, 100 - avgGap * 5) : 0;
  const friendshipScore = timeline.length ? Math.min(100, ((totalAtoB + totalBtoA) / timeline.length / 24) * 100) : 0;

  return {
    a,
    b,
    participationsTogether,
    totalAtoB,
    totalBtoA,
    avgAtoB: aToB.length ? totalAtoB / new Set(aToB.map((v) => v.edition_id)).size : null,
    avgBtoA: bToA.length ? totalBtoA / new Set(bToA.map((v) => v.edition_id)).size : null,
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

/* ============================================================ 3) HEAD-TO-HEAD */

export type HeadToHeadRow = {
  editionId: string;
  year: number | null;
  aRank: number | null;
  bRank: number | null;
  diff: number | null;
};

export type HeadToHead = {
  a: string;
  b: string;
  sharedEditions: number;
  aWins: number; // times a finished higher
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
  opts: { editions: Edition[]; results: ResultRow[] },
): HeadToHead {
  const editionMeta = toEditionMeta(opts.editions);
  const byEdition = new Map<string, { a?: ResultRow; b?: ResultRow }>();
  opts.results.forEach((r) => {
    if (r.country_id !== a && r.country_id !== b) return;
    const cur = byEdition.get(r.edition_id) ?? {};
    if (r.country_id === a) cur.a = r;
    else cur.b = r;
    byEdition.set(r.edition_id, cur);
  });

  const rows: HeadToHeadRow[] = [...byEdition.entries()]
    .filter(([, v]) => v.a && v.b)
    .map(([editionId, v]) => {
      const aRank = v.a!.final_rank;
      const bRank = v.b!.final_rank;
      return {
        editionId,
        year: editionMeta.get(editionId)?.year ?? null,
        aRank,
        bRank,
        diff: aRank != null && bRank != null ? aRank - bRank : null,
      };
    })
    .sort((x, y) => (x.year ?? 0) - (y.year ?? 0));

  const aWins = rows.filter((r) => r.diff != null && r.diff < 0).length;
  const bWins = rows.filter((r) => r.diff != null && r.diff > 0).length;
  const ties = rows.filter((r) => r.diff === 0).length;
  const validDiffs = rows.filter((r) => r.diff != null) as (HeadToHeadRow & { diff: number })[];
  const closest = validDiffs.length ? validDiffs.reduce((p, c) => (Math.abs(c.diff) < Math.abs(p.diff) ? c : p)) : null;
  const largest = validDiffs.length ? validDiffs.reduce((p, c) => (Math.abs(c.diff) > Math.abs(p.diff) ? c : p)) : null;

  return {
    a,
    b,
    sharedEditions: rows.length,
    aWins,
    bWins,
    ties,
    avgDiff: avg(validDiffs.map((r) => Math.abs(r.diff))),
    closest,
    largest,
    rows,
  };
}

/* ============================================================ 4) CONTEST STATISTICS (per edition/show) */

export type ContestStats = {
  showId: string;
  closestVictory: { margin: number; winner: string; runnerUp: string } | null;
  biggestLandslide: { margin: number; winner: string; runnerUp: string } | null;
  biggestTelevoteWinner: { countryId: string; points: number } | null;
  biggestJuryWinner: { countryId: string; points: number } | null;
  highestScoringDebut: { countryId: string; points: number } | null;
  largestRankingJump: { countryId: string; jump: number } | null; // televote rank vs jury rank
  mostExchangedTopScores: { a: string; b: string; count: number } | null;
  strongestAlliance: { a: string; b: string; total: number } | null;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  unpredictabilityIndex: number | null; // avg abs diff between jury & televote rank
};

export function computeContestStats(
  showId: string,
  opts: { results: ResultRow[]; jury: JuryVote[]; debutCountryIds?: Set<string>; shows?: Show[] },
): ContestStats {
  const rows = opts.results.filter((r) => r.show_id === showId).sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
  const jury = withVoterCountry(opts.jury).filter((v) => v.show_id === showId);

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
  const margin = runnerUp ? winner.total_points - runnerUp.total_points : null;

  const byTelevote = [...rows].sort((a, b) => b.televote_points - a.televote_points)[0];
  const byJury = [...rows].sort((a, b) => b.jury_points - a.jury_points)[0];

  const debutRows = opts.debutCountryIds ? rows.filter((r) => opts.debutCountryIds!.has(r.country_id)) : [];
  const highestDebut = debutRows.length ? [...debutRows].sort((a, b) => b.total_points - a.total_points)[0] : null;

  const juryRank = new Map([...rows].sort((a, b) => b.jury_points - a.jury_points).map((r, i) => [r.country_id, i + 1]));
  const teleRank = new Map([...rows].sort((a, b) => b.televote_points - a.televote_points).map((r, i) => [r.country_id, i + 1]));
  let largestJump: { countryId: string; jump: number } | null = null;
  rows.forEach((r) => {
    const jr = juryRank.get(r.country_id) ?? 0;
    const tr = teleRank.get(r.country_id) ?? 0;
    const jump = jr - tr;
    if (!largestJump || Math.abs(jump) > Math.abs(largestJump.jump)) largestJump = { countryId: r.country_id, jump };
  });

  const resolveTop = makeTopScoreResolver(opts.shows);
  const makeTopScoreResolverCached = () => resolveTop;
  const pairTotals = new Map<string, { a: string; b: string; total: number; twelves: number }>();
  jury.forEach((v) => {
    const key = [v.voter_country_id, v.receiving_country_id].sort().join("|");
    const cur = pairTotals.get(key) ?? { a: v.voter_country_id, b: v.receiving_country_id, total: 0, twelves: 0 };
    cur.total += v.points;
    if (isTopScore(v, makeTopScoreResolverCached())) cur.twelves += 1;
    pairTotals.set(key, cur);
  });
  const byTopScores = [...pairTotals.values()].sort((a, b) => b.twelves - a.twelves)[0];
  const byAlliance = [...pairTotals.values()].sort((a, b) => b.total - a.total)[0];

  const scores = rows.map((r) => r.total_points);
  const diffs = rows.map((r) => Math.abs((juryRank.get(r.country_id) ?? 0) - (teleRank.get(r.country_id) ?? 0)));

  return {
    showId,
    closestVictory: margin != null ? { margin, winner: winner.country_id, runnerUp: runnerUp!.country_id } : null,
    biggestLandslide: margin != null ? { margin, winner: winner.country_id, runnerUp: runnerUp!.country_id } : null,
    biggestTelevoteWinner: byTelevote ? { countryId: byTelevote.country_id, points: byTelevote.televote_points } : null,
    biggestJuryWinner: byJury ? { countryId: byJury.country_id, points: byJury.jury_points } : null,
    highestScoringDebut: highestDebut ? { countryId: highestDebut.country_id, points: highestDebut.total_points } : null,
    largestRankingJump: largestJump,
    mostExchangedTopScores: byTopScores ? { a: byTopScores.a, b: byTopScores.b, count: byTopScores.twelves } : null,
    strongestAlliance: byAlliance ? { a: byAlliance.a, b: byAlliance.b, total: byAlliance.total } : null,
    averageScore: avg(scores),
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    unpredictabilityIndex: avg(diffs),
  };
}

/* ============================================================ 5) HISTORICAL RECORDS */

export type HistoricalRecordEntry = { label: string; value: string; detail: string };

export function computeHistoricalRecords(opts: {
  countries: Country[];
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
}): HistoricalRecordEntry[] {
  const name = new Map(opts.countries.map((c) => [c.id, c.name]));
  const editionMeta = toEditionMeta(opts.editions);
  const showById = new Map(opts.shows.map((s) => [s.id, s]));
  const finalResults = opts.results.filter((r) => showById.get(r.show_id ?? "")?.kind === "grand-final");

  const byCountry = new Map<string, ResultRow[]>();
  opts.results.forEach((r) => byCountry.set(r.country_id, [...(byCountry.get(r.country_id) ?? []), r]));

  const out: HistoricalRecordEntry[] = [];
  const push = (label: string, value: string, detail: string) => out.push({ label, value, detail });

  // most participations
  const parts = new Map<string, number>();
  const partEditions = new Map<string, Set<string>>();
  opts.participants.forEach((p) => {
    const set = partEditions.get(p.country_id) ?? new Set<string>();
    set.add(p.edition_id);
    partEditions.set(p.country_id, set);
  });
  partEditions.forEach((set, id) => parts.set(id, set.size));
  const topParts = [...parts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topParts) push("Most participations", `${topParts[1]}`, name.get(topParts[0]) ?? "?");

  // longest qualification streak / non-qualification streak
  const semiParts = opts.participants.filter((p) => showById.get(p.show_id ?? "")?.kind === "semi-final");
  const byCountrySemis = new Map<string, Participant[]>();
  semiParts.forEach((p) => byCountrySemis.set(p.country_id, [...(byCountrySemis.get(p.country_id) ?? []), p]));
  let bestQualStreak = { id: "", n: 0 };
  let bestNonQualStreak = { id: "", n: 0 };
  byCountrySemis.forEach((rows, id) => {
    const sorted = rows.slice().sort((a, b) => (editionMeta.get(a.edition_id)?.year ?? 0) - (editionMeta.get(b.edition_id)?.year ?? 0));
    const q = longestStreak(sorted.map((r) => r.qualified === true));
    const nq = longestStreak(sorted.map((r) => r.qualified === false));
    if (q > bestQualStreak.n) bestQualStreak = { id, n: q };
    if (nq > bestNonQualStreak.n) bestNonQualStreak = { id, n: nq };
  });
  if (bestQualStreak.n) push("Longest qualification streak", `${bestQualStreak.n}`, name.get(bestQualStreak.id) ?? "?");
  if (bestNonQualStreak.n) push("Longest non-qualification streak", `${bestNonQualStreak.n}`, name.get(bestNonQualStreak.id) ?? "?");

  // win drought & consecutive wins/top10s
  const editionsByYear = opts.editions.slice().sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  let bestWinStreak = { id: "", n: 0 };
  let bestTop10Streak = { id: "", n: 0 };
  let longestDrought = { id: "", n: 0 };
  byCountry.forEach((rows, id) => {
    const finals = rows.filter((r) => showById.get(r.show_id ?? "")?.kind === "grand-final");
    const sorted = finals.slice().sort((a, b) => (editionMeta.get(a.edition_id)?.year ?? 0) - (editionMeta.get(b.edition_id)?.year ?? 0));
    const winFlags = sorted.map((r) => r.final_rank === 1);
    const top10Flags = sorted.map((r) => r.final_rank != null && r.final_rank <= 10);
    const winStreak = longestStreak(winFlags);
    const top10Streak = longestStreak(top10Flags);
    if (winStreak > bestWinStreak.n) bestWinStreak = { id, n: winStreak };
    if (top10Streak > bestTop10Streak.n) bestTop10Streak = { id, n: top10Streak };
    // drought: longest run without a win, only for countries with at least 1 win
    if (winFlags.some(Boolean)) {
      let run = 0, maxRun = 0, started = false;
      winFlags.forEach((w) => {
        if (w) { started = true; run = 0; }
        else if (started) { run++; maxRun = Math.max(maxRun, run); }
      });
      if (maxRun > longestDrought.n) longestDrought = { id, n: maxRun };
    }
  });
  if (bestWinStreak.n) push("Most consecutive wins", `${bestWinStreak.n}`, name.get(bestWinStreak.id) ?? "?");
  if (bestTop10Streak.n) push("Most consecutive top-10 finishes", `${bestTop10Streak.n}`, name.get(bestTop10Streak.id) ?? "?");
  if (longestDrought.n) push("Longest win drought", `${longestDrought.n} editions`, name.get(longestDrought.id) ?? "?");

  // most points in one edition
  if (finalResults.length) {
    const top = [...finalResults].sort((a, b) => b.total_points - a.total_points)[0];
    push("Most points in one edition", `${top.total_points}`, `${name.get(top.country_id) ?? "?"} · ${editionMeta.get(top.edition_id)?.year ?? ""}`);
    // most points lost after televote (jury led, televote dragged down)
    const lost = [...finalResults].sort((a, b) => b.jury_points - b.televote_points - (a.jury_points - a.televote_points))[0];
    push(
      "Biggest jury collapse (televote drag)",
      `-${lost.jury_points - lost.televote_points}`,
      `${name.get(lost.country_id) ?? "?"} · ${editionMeta.get(lost.edition_id)?.year ?? ""}`,
    );
    const gained = [...finalResults].sort((a, b) => b.televote_points - b.jury_points - (a.televote_points - a.jury_points))[0];
    push(
      "Biggest televote comeback",
      `+${gained.televote_points - gained.jury_points}`,
      `${name.get(gained.country_id) ?? "?"} · ${editionMeta.get(gained.edition_id)?.year ?? ""}`,
    );
  }

  // most different winners defeated: for a country, count distinct countries that won an edition it also placed below in
  const winnersByEdition = new Map<string, string>();
  finalResults.filter((r) => r.final_rank === 1).forEach((r) => winnersByEdition.set(r.edition_id, r.country_id));
  const defeatedWinners = new Map<string, Set<string>>();
  finalResults.forEach((r) => {
    const w = winnersByEdition.get(r.edition_id);
    if (!w || w === r.country_id) return;
    const s = defeatedWinners.get(r.country_id) ?? new Set<string>();
    s.add(w);
    defeatedWinners.set(r.country_id, s);
  });
  let mostDefeated = { id: "", n: 0 };
  defeatedWinners.forEach((s, id) => {
    if (s.size > mostDefeated.n) mostDefeated = { id, n: s.size };
  });
  if (mostDefeated.n) push("Most different winners finished below", `${mostDefeated.n}`, name.get(mostDefeated.id) ?? "?");

  return out;
}

/* ============================================================ 6) VOTING INTELLIGENCE */

export type Kingmaker = { countryId: string; influenceScore: number };
export type VotingIntelligence = {
  kingmakers: Kingmaker[]; // countries whose votes most correlate with eventual winners
  voteVolatility: { countryId: string; stdDev: number }[]; // std dev of points given per edition
  predictability: { countryId: string; score: number }[]; // how consistent voting patterns are (low volatility = high)
  loyaltyScore: { countryId: string; score: number }[]; // concentration of points to same few recipients across editions
  diversityScore: { countryId: string; score: number }[]; // distinct recipients / total editions
  strategicVotingIndex: { countryId: string; score: number }[]; // gap between jury given & televote-correlated points (proxy)
  regionalDependence: { countryId: string; share: number }[];
  juryPublicDisagreement: number | null; // overall average |jury rank - televote rank|
};

export function computeVotingIntelligence(opts: {
  countries: Country[];
  jury: JuryVote[];
  results: ResultRow[];
}): VotingIntelligence {
  const jury = withVoterCountry(opts.jury);
  const region = new Map(opts.countries.map((c) => [c.id, c.region]));

  // kingmakers: correlation between a country's votes and eventual winner across editions
  const winnersByEdition = new Map<string, string>();
  opts.results.filter((r) => r.final_rank === 1).forEach((r) => winnersByEdition.set(r.edition_id, r.country_id));
  const kingmakerScore = new Map<string, { given: number; toWinner: number }>();
  jury.forEach((v) => {
    const cur = kingmakerScore.get(v.voter_country_id) ?? { given: 0, toWinner: 0 };
    cur.given += v.points;
    if (winnersByEdition.get(v.edition_id) === v.receiving_country_id) cur.toWinner += v.points;
    kingmakerScore.set(v.voter_country_id, cur);
  });
  const kingmakers: Kingmaker[] = [...kingmakerScore.entries()]
    .map(([countryId, v]) => ({ countryId, influenceScore: v.given ? (v.toWinner / v.given) * 100 : 0 }))
    .sort((a, b) => b.influenceScore - a.influenceScore);

  // volatility: std dev of total points given per edition
  const byCountryEdition = new Map<string, Map<string, number>>();
  jury.forEach((v) => {
    const m = byCountryEdition.get(v.voter_country_id) ?? new Map<string, number>();
    m.set(v.edition_id, (m.get(v.edition_id) ?? 0) + v.points);
    byCountryEdition.set(v.voter_country_id, m);
  });
  const voteVolatility: { countryId: string; stdDev: number }[] = [];
  byCountryEdition.forEach((m, countryId) => {
    const vals = [...m.values()];
    const mean = avg(vals) ?? 0;
    const variance = vals.length ? vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length : 0;
    voteVolatility.push({ countryId, stdDev: Math.sqrt(variance) });
  });
  voteVolatility.sort((a, b) => b.stdDev - a.stdDev);
  const maxStd = Math.max(1, ...voteVolatility.map((v) => v.stdDev));
  const predictability = voteVolatility.map((v) => ({ countryId: v.countryId, score: 100 - (v.stdDev / maxStd) * 100 }));

  // loyalty: share of points given to top recipient across all history
  const loyaltyScore: { countryId: string; score: number }[] = [];
  const diversityScore: { countryId: string; score: number }[] = [];
  const byCountry = new Map<string, JuryVote[]>();
  jury.forEach((v) => byCountry.set(v.voter_country_id, [...(byCountry.get(v.voter_country_id) ?? []), v]));
  byCountry.forEach((votes, countryId) => {
    const recipientTotals = new Map<string, number>();
    votes.forEach((v) => recipientTotals.set(v.receiving_country_id, (recipientTotals.get(v.receiving_country_id) ?? 0) + v.points));
    const total = votes.reduce((a, v) => a + v.points, 0);
    const top = Math.max(0, ...recipientTotals.values());
    loyaltyScore.push({ countryId, score: total ? (top / total) * 100 : 0 });
    const editionsVoted = new Set(votes.map((v) => v.edition_id)).size;
    diversityScore.push({ countryId, score: editionsVoted ? (recipientTotals.size / editionsVoted) : 0 });
  });
  loyaltyScore.sort((a, b) => b.score - a.score);
  diversityScore.sort((a, b) => b.score - a.score);

  // strategic voting index: proxy = share of points given to countries in same region beyond expectation (reuse regional dependence)
  const regionalDependence: { countryId: string; share: number }[] = [];
  byCountry.forEach((votes, countryId) => {
    const total = votes.reduce((a, v) => a + v.points, 0);
    const inRegion = votes
      .filter((v) => region.get(v.voter_country_id) === region.get(v.receiving_country_id))
      .reduce((a, v) => a + v.points, 0);
    regionalDependence.push({ countryId, share: total ? (inRegion / total) * 100 : 0 });
  });
  regionalDependence.sort((a, b) => b.share - a.share);

  const strategicVotingIndex = regionalDependence.map((r) => ({ countryId: r.countryId, score: r.share }));

  // jury/public disagreement: average |jury rank - televote rank| across all shows with results
  const byShow = new Map<string, ResultRow[]>();
  opts.results.forEach((r) => byShow.set(r.show_id ?? "", [...(byShow.get(r.show_id ?? "") ?? []), r]));
  const diffs: number[] = [];
  byShow.forEach((rows) => {
    if (rows.length < 2) return;
    const juryRank = new Map([...rows].sort((a, b) => b.jury_points - a.jury_points).map((r, i) => [r.country_id, i + 1]));
    const teleRank = new Map([...rows].sort((a, b) => b.televote_points - a.televote_points).map((r, i) => [r.country_id, i + 1]));
    rows.forEach((r) => diffs.push(Math.abs((juryRank.get(r.country_id) ?? 0) - (teleRank.get(r.country_id) ?? 0))));
  });

  return {
    kingmakers: kingmakers.slice(0, 15),
    voteVolatility: voteVolatility.slice(0, 15),
    predictability: predictability.sort((a, b) => b.score - a.score).slice(0, 15),
    loyaltyScore: loyaltyScore.slice(0, 15),
    diversityScore: diversityScore.slice(0, 15),
    strategicVotingIndex: strategicVotingIndex.slice(0, 15),
    regionalDependence: regionalDependence.slice(0, 15),
    juryPublicDisagreement: avg(diffs),
  };
}

/* ============================================================ point flow / heatmap helpers for UI */

export type PointFlowLink = { source: string; target: string; value: number };

export function buildPointFlow(jury: JuryVote[], minValue = 1): PointFlowLink[] {
  const votes = withVoterCountry(jury);
  const m = new Map<string, number>();
  votes.forEach((v) => {
    const key = `${v.voter_country_id}>${v.receiving_country_id}`;
    m.set(key, (m.get(key) ?? 0) + v.points);
  });
  return [...m.entries()]
    .map(([key, value]) => {
      const [source, target] = key.split(">");
      return { source, target, value };
    })
    .filter((l) => l.value >= minValue)
    .sort((a, b) => b.value - a.value);
}

export function buildHeatmapMatrix(countries: Country[], jury: JuryVote[]) {
  const votes = withVoterCountry(jury);
  const ids = countries.map((c) => c.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const matrix: number[][] = ids.map(() => ids.map(() => 0));
  votes.forEach((v) => {
    const i = idx.get(v.voter_country_id);
    const j = idx.get(v.receiving_country_id);
    if (i == null || j == null) return;
    matrix[i][j] += v.points;
  });
  return { ids, matrix };
}
