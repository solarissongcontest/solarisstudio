import {
  editionLabel,
  type Country,
  type Edition,
  type JuryVote,
  type Participant,
  type ResultRow,
  type Show,
} from "./data";
import { canonicalEntryFor } from "./entry-utils";
import { isTopScore, makeTopScoreResolver } from "./voting";

export type FanRecordCategory = "career" | "streaks" | "edition" | "voting" | "regional" | "unusual";

export type FanRecordHolder = {
  countryId: string;
  countryName: string;
  shortCode: string;
  flagImage: string | null;
  accentColor: string;
  editionId?: string;
  editionLabel?: string;
  artist?: string | null;
  song?: string | null;
  context?: string | null;
};

export type FanRecord = {
  id: string;
  label: string;
  value: string;
  category: FanRecordCategory;
  explanation: string;
  holders: FanRecordHolder[];
};

type Input = {
  countries: Country[];
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
};

type Metric<T> = T & { metric: number };

function tied<T>(items: Array<Metric<T>>, mode: "max" | "min", epsilon = 1e-9) {
  if (!items.length) return { value: null as number | null, rows: [] as Array<Metric<T>> };
  const value = mode === "max"
    ? Math.max(...items.map((item) => item.metric))
    : Math.min(...items.map((item) => item.metric));
  return { value, rows: items.filter((item) => Math.abs(item.metric - value) <= epsilon) };
}

function uniqueBy<T>(rows: T[], key: (row: T) => string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = key(row);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function buildFanRecords(input: Input): FanRecord[] {
  const { countries, editions, shows, participants, results, jury } = input;
  const countryMap = new Map(countries.map((country) => [country.id, country]));
  const editionMap = new Map(editions.map((edition) => [edition.id, edition]));
  const showMap = new Map(shows.map((show) => [show.id, show]));
  const finalShowIds = new Set(
    shows.filter((show) => show.kind === "grand-final" || show.kind === "final").map((show) => show.id),
  );
  const semiShowIds = new Set(
    shows.filter((show) => show.kind === "semi-final" || show.kind === "semi").map((show) => show.id),
  );
  const finalRows = results.filter(
    (row) => Boolean(row.show_id && finalShowIds.has(row.show_id)) && row.final_rank != null,
  );
  const records: FanRecord[] = [];

  const holder = (countryId: string, editionId?: string, context?: string | null): FanRecordHolder | null => {
    const country = countryMap.get(countryId);
    if (!country) return null;
    const edition = editionId ? editionMap.get(editionId) : undefined;
    const entry = editionId ? canonicalEntryFor(participants, editionId, countryId) : null;
    return {
      countryId,
      countryName: country.name,
      shortCode: country.short_code,
      flagImage: country.flag_image,
      accentColor: country.accent_color,
      editionId,
      editionLabel: edition ? editionLabel(edition) : undefined,
      artist: entry?.artist ?? null,
      song: entry?.song ?? null,
      context: context ?? null,
    };
  };

  const add = (
    id: string,
    label: string,
    value: string,
    category: FanRecordCategory,
    explanation: string,
    rawHolders: Array<FanRecordHolder | null>,
  ) => {
    const holders = rawHolders.filter((item): item is FanRecordHolder => Boolean(item));
    if (!holders.length) return;
    records.push({ id, label, value, category, explanation, holders });
  };

  const finalByCountry = new Map<string, ResultRow[]>();
  for (const row of finalRows) {
    finalByCountry.set(row.country_id, [...(finalByCountry.get(row.country_id) ?? []), row]);
  }

  const participationKeys = new Set<string>();
  for (const participant of participants) participationKeys.add(`${participant.country_id}:${participant.edition_id}`);
  for (const row of finalRows) participationKeys.add(`${row.country_id}:${row.edition_id}`);
  const participationCounts = new Map<string, number>();
  for (const key of participationKeys) {
    const countryId = key.split(":")[0];
    participationCounts.set(countryId, (participationCounts.get(countryId) ?? 0) + 1);
  }

  const career = countries.map((country) => {
    const rows = finalByCountry.get(country.id) ?? [];
    const wins = rows.filter((row) => row.final_rank === 1).length;
    const podiums = rows.filter((row) => (row.final_rank ?? 999) <= 3).length;
    const top5 = rows.filter((row) => (row.final_rank ?? 999) <= 5).length;
    const top10 = rows.filter((row) => (row.final_rank ?? 999) <= 10).length;
    const points = rows.reduce((sum, row) => sum + row.total_points, 0);
    const averageRank = rows.length ? rows.reduce((sum, row) => sum + (row.final_rank ?? 0), 0) / rows.length : null;
    const averagePoints = rows.length ? points / rows.length : null;
    return { countryId: country.id, participations: participationCounts.get(country.id) ?? 0, finals: rows.length, wins, podiums, top5, top10, points, averageRank, averagePoints };
  });

  const careerRecord = (
    id: string,
    label: string,
    field: keyof Pick<(typeof career)[number], "participations" | "finals" | "wins" | "podiums" | "top5" | "top10" | "points">,
    explanation: string,
  ) => {
    const extreme = tied(career.filter((row) => Number(row[field]) > 0).map((row) => ({ ...row, metric: Number(row[field]) })), "max");
    if (extreme.value == null) return;
    add(id, label, String(extreme.value), "career", explanation, extreme.rows.map((row) => holder(row.countryId, undefined, `${row.finals} archived final${row.finals === 1 ? "" : "s"}`)));
  };

  careerRecord("participations", "Most SSC participations", "participations", "Unique country appearances by edition. Semi-final and final are one participation, never two.");
  careerRecord("finals", "Most Grand Final appearances", "finals", "Archived Grand Final appearances.");
  careerRecord("wins", "Most wins", "wins", "Grand Final victories in the loaded archive.");
  careerRecord("podiums", "Most podium finishes", "podiums", "Grand Final finishes in the top three.");
  careerRecord("top5", "Most top-5 finishes", "top5", "Grand Final finishes from 1st to 5th.");
  careerRecord("top10", "Most top-10 finishes", "top10", "Grand Final finishes from 1st to 10th.");
  careerRecord("career-points", "Most career final points", "points", "Total points accumulated across archived Grand Finals.");

  const avgRankCandidates = career.filter((row) => row.averageRank != null && row.finals >= 2).map((row) => ({ ...row, metric: row.averageRank! }));
  const avgRankPool = avgRankCandidates.length ? avgRankCandidates : career.filter((row) => row.averageRank != null).map((row) => ({ ...row, metric: row.averageRank! }));
  const bestAverageRank = tied(avgRankPool, "min", 0.0001);
  if (bestAverageRank.value != null) add("best-average-rank", "Best average final placement", `#${bestAverageRank.value.toFixed(1)}`, "career", "Lowest average Grand Final placement. Two or more archived finals are preferred when the archive allows it.", bestAverageRank.rows.map((row) => holder(row.countryId, undefined, `${row.finals} archived final${row.finals === 1 ? "" : "s"}`)));

  const avgPointCandidates = career.filter((row) => row.averagePoints != null && row.finals >= 2).map((row) => ({ ...row, metric: row.averagePoints! }));
  const avgPointPool = avgPointCandidates.length ? avgPointCandidates : career.filter((row) => row.averagePoints != null).map((row) => ({ ...row, metric: row.averagePoints! }));
  const bestAveragePoints = tied(avgPointPool, "max", 0.0001);
  if (bestAveragePoints.value != null) add("best-average-points", "Highest average final points", bestAveragePoints.value.toFixed(1), "career", "Average points per archived Grand Final.", bestAveragePoints.rows.map((row) => holder(row.countryId, undefined, `${row.finals} archived final${row.finals === 1 ? "" : "s"}`)));

  const byShow = new Map<string, ResultRow[]>();
  for (const row of finalRows) {
    if (!row.show_id) continue;
    byShow.set(row.show_id, [...(byShow.get(row.show_id) ?? []), row]);
  }
  const lastCounts = new Map<string, number>();
  for (const rows of byShow.values()) {
    const lastRank = Math.max(...rows.map((row) => row.final_rank ?? 0));
    rows.filter((row) => row.final_rank === lastRank).forEach((row) => lastCounts.set(row.country_id, (lastCounts.get(row.country_id) ?? 0) + 1));
  }
  const lastExtreme = tied([...lastCounts.entries()].map(([countryId, metric]) => ({ countryId, metric })), "max");
  if (lastExtreme.value != null) add("last-places", "Most last-place finishes", String(lastExtreme.value), "career", "Tied last places are counted for every country sharing the last rank.", lastExtreme.rows.map((row) => holder(row.countryId)));

  // Streak histories use edition numbers because a streak should not jump over a missing edition.
  const editionNumber = new Map(editions.map((edition) => [edition.id, edition.edition_number]));
  const rankHistory = new Map<string, Map<number, number>>();
  for (const row of finalRows) {
    const number = editionNumber.get(row.edition_id);
    if (number == null || row.final_rank == null) continue;
    const map = rankHistory.get(row.country_id) ?? new Map<number, number>();
    map.set(number, row.final_rank);
    rankHistory.set(row.country_id, map);
  }

  const streakSegments = (predicate: (rank: number) => boolean) => {
    const segments: Array<{ countryId: string; from: number; to: number; length: number }> = [];
    for (const [countryId, history] of rankHistory) {
      const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
      let current: { from: number; to: number; length: number } | null = null;
      for (const [number, rank] of ordered) {
        if (predicate(rank) && current && number === current.to + 1) current = { ...current, to: number, length: current.length + 1 };
        else if (predicate(rank)) current = { from: number, to: number, length: 1 };
        else current = null;
        if (current) segments.push({ countryId, ...current });
      }
    }
    return segments;
  };

  const addStreak = (id: string, label: string, maximumRank: number, explanation: string) => {
    const extreme = tied(streakSegments((rank) => rank <= maximumRank).map((row) => ({ ...row, metric: row.length })), "max");
    if (extreme.value == null) return;
    const rows = uniqueBy(extreme.rows, (row) => `${row.countryId}:${row.from}:${row.to}`);
    add(id, label, `${extreme.value} edition${extreme.value === 1 ? "" : "s"}`, "streaks", explanation, rows.map((row) => holder(row.countryId, undefined, row.from === row.to ? `SSC ${row.from}` : `SSC ${row.from}–${row.to}`)));
  };
  addStreak("win-streak", "Longest winning streak", 1, "Consecutive editions won.");
  addStreak("podium-streak", "Longest podium streak", 3, "Consecutive editions finishing on the podium.");
  addStreak("top5-streak", "Longest top-5 streak", 5, "Consecutive editions finishing in the top five.");
  addStreak("top10-streak", "Longest top-10 streak", 10, "Consecutive editions finishing in the top ten.");

  const finalPresence = new Set(finalRows.map((row) => `${row.country_id}:${row.edition_id}`));
  const qualificationHistory = new Map<string, Map<number, boolean>>();
  for (const participant of participants) {
    if (!participant.show_id || !semiShowIds.has(participant.show_id)) continue;
    const number = editionNumber.get(participant.edition_id);
    if (number == null) continue;
    const qualified = participant.qualified === true || finalPresence.has(`${participant.country_id}:${participant.edition_id}`)
      ? true
      : participant.qualified === false
        ? false
        : null;
    if (qualified == null) continue;
    const map = qualificationHistory.get(participant.country_id) ?? new Map<number, boolean>();
    const current = map.get(number);
    map.set(number, current === true ? true : qualified);
    qualificationHistory.set(participant.country_id, map);
  }

  const qualificationSegments = (wanted: boolean) => {
    const segments: Array<{ countryId: string; from: number; to: number; length: number }> = [];
    for (const [countryId, history] of qualificationHistory) {
      const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
      let current: { from: number; to: number; length: number } | null = null;
      for (const [number, value] of ordered) {
        if (value === wanted && current && number === current.to + 1) current = { ...current, to: number, length: current.length + 1 };
        else if (value === wanted) current = { from: number, to: number, length: 1 };
        else current = null;
        if (current) segments.push({ countryId, ...current });
      }
    }
    return segments;
  };

  const qualificationExtreme = tied(qualificationSegments(true).map((row) => ({ ...row, metric: row.length })), "max");
  if (qualificationExtreme.value != null) add("qualification-streak", "Longest qualification streak", `${qualificationExtreme.value} edition${qualificationExtreme.value === 1 ? "" : "s"}`, "streaks", "Consecutive semi-final editions where the country reached the final.", uniqueBy(qualificationExtreme.rows, (row) => `${row.countryId}:${row.from}:${row.to}`).map((row) => holder(row.countryId, undefined, row.from === row.to ? `SSC ${row.from}` : `SSC ${row.from}–${row.to}`)));

  const nqExtreme = tied(qualificationSegments(false).map((row) => ({ ...row, metric: row.length })), "max");
  if (nqExtreme.value != null) add("nq-streak", "Longest non-qualification streak", `${nqExtreme.value} edition${nqExtreme.value === 1 ? "" : "s"}`, "streaks", "Consecutive semi-final editions ending in non-qualification.", uniqueBy(nqExtreme.rows, (row) => `${row.countryId}:${row.from}:${row.to}`).map((row) => holder(row.countryId, undefined, row.from === row.to ? `SSC ${row.from}` : `SSC ${row.from}–${row.to}`)));

  const currentQual: Array<{ countryId: string; from: number; to: number; metric: number }> = [];
  for (const [countryId, history] of qualificationHistory) {
    const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
    if (!ordered.length || ordered[ordered.length - 1][1] !== true) continue;
    let to = ordered[ordered.length - 1][0];
    let from = to;
    let length = 1;
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      const [number, value] = ordered[index];
      if (value !== true || number !== from - 1) break;
      from = number; length += 1;
    }
    currentQual.push({ countryId, from, to, metric: length });
  }
  const currentQualExtreme = tied(currentQual, "max");
  if (currentQualExtreme.value != null) add("current-qualification-streak", "Longest current qualification streak", `${currentQualExtreme.value} edition${currentQualExtreme.value === 1 ? "" : "s"}`, "streaks", "Active run of consecutive qualifications ending at that country's latest archived semi-final.", currentQualExtreme.rows.map((row) => holder(row.countryId, undefined, row.from === row.to ? `SSC ${row.to}` : `SSC ${row.from}–${row.to}`)));

  // Single-edition result records. Every exact tie is preserved.
  const addRowExtreme = (
    id: string,
    label: string,
    key: "total_points" | "jury_points" | "televote_points",
    mode: "max" | "min",
    category: FanRecordCategory,
    explanation: string,
    pool = finalRows,
  ) => {
    const extreme = tied(pool.map((row) => ({ row, metric: row[key] })), mode);
    if (extreme.value == null) return;
    add(id, label, `${extreme.value} pts`, category, explanation, extreme.rows.map(({ row }) => holder(row.country_id, row.edition_id)));
  };
  addRowExtreme("highest-score", "Highest Grand Final score", "total_points", "max", "edition", "Largest combined score in one archived Grand Final.");
  addRowExtreme("lowest-score", "Lowest Grand Final score", "total_points", "min", "edition", "Smallest combined score attached to a ranked Grand Final result.");
  addRowExtreme("highest-jury", "Highest jury score", "jury_points", "max", "edition", "Largest jury component in one archived Grand Final.");
  addRowExtreme("highest-tele", "Highest televote score", "televote_points", "max", "edition", "Largest televote component in one archived Grand Final.");

  const nonWinners = finalRows.filter((row) => row.final_rank !== 1);
  addRowExtreme("points-without-win", "Most points without winning", "total_points", "max", "unusual", "Highest Grand Final score that still did not finish first.", nonWinners);
  const winners = finalRows.filter((row) => row.final_rank === 1);
  addRowExtreme("lowest-winner", "Lowest-scoring winner", "total_points", "min", "unusual", "Smallest combined score among archived Grand Final winners.", winners);

  const margins: Array<{ winner: ResultRow; metric: number }> = [];
  for (const rows of byShow.values()) {
    const sorted = [...rows].sort((a, b) => b.total_points - a.total_points);
    if (sorted[0] && sorted[1]) margins.push({ winner: sorted[0], metric: sorted[0].total_points - sorted[1].total_points });
  }
  const closest = tied(margins, "min");
  if (closest.value != null) add("closest-win", "Closest winning margin", `${closest.value} pt${closest.value === 1 ? "" : "s"}`, "edition", "Smallest gap between first and second in the same archived Grand Final.", closest.rows.map(({ winner }) => holder(winner.country_id, winner.edition_id)));
  const landslide = tied(margins, "max");
  if (landslide.value != null) add("largest-win", "Largest winning margin", `${landslide.value} pts`, "edition", "Largest gap between first and second in the same archived Grand Final.", landslide.rows.map(({ winner }) => holder(winner.country_id, winner.edition_id)));

  const rankMetrics: Array<{ row: ResultRow; juryRank: number; teleRank: number; finalRank: number }> = [];
  const competitionRanks = (rows: ResultRow[], key: "jury_points" | "televote_points" | "total_points") => {
    const sorted = [...rows].sort((a, b) => b[key] - a[key] || a.country_id.localeCompare(b.country_id));
    const map = new Map<string, number>();
    let previous: number | null = null; let rank = 0;
    sorted.forEach((row, index) => { if (previous == null || row[key] !== previous) rank = index + 1; previous = row[key]; map.set(row.country_id, rank); });
    return map;
  };
  for (const rows of byShow.values()) {
    const jr = competitionRanks(rows, "jury_points"); const tr = competitionRanks(rows, "televote_points"); const fr = competitionRanks(rows, "total_points");
    rows.forEach((row) => rankMetrics.push({ row, juryRank: jr.get(row.country_id) ?? rows.length, teleRank: tr.get(row.country_id) ?? rows.length, finalRank: row.final_rank ?? fr.get(row.country_id) ?? rows.length }));
  }

  const rescue = tied(rankMetrics.map((item) => ({ ...item, metric: item.juryRank - item.finalRank })).filter((item) => item.metric > 0), "max");
  if (rescue.value != null) add("televote-rescue", "Biggest televote rescue", `${rescue.value} place${rescue.value === 1 ? "" : "s"}`, "edition", "Largest rise from jury rank to final combined rank.", rescue.rows.map((item) => holder(item.row.country_id, item.row.edition_id, `Jury #${item.juryRank} → final #${item.finalRank}`)));
  const collapse = tied(rankMetrics.map((item) => ({ ...item, metric: item.finalRank - item.juryRank })).filter((item) => item.metric > 0), "max");
  if (collapse.value != null) add("post-jury-collapse", "Biggest post-jury collapse", `${collapse.value} place${collapse.value === 1 ? "" : "s"}`, "edition", "Largest fall from jury rank to final combined rank.", collapse.rows.map((item) => holder(item.row.country_id, item.row.edition_id, `Jury #${item.juryRank} → final #${item.finalRank}`)));
  const disagreement = tied(rankMetrics.map((item) => ({ ...item, metric: Math.abs(item.juryRank - item.teleRank) })).filter((item) => item.metric > 0), "max");
  if (disagreement.value != null) add("jury-tele-gap", "Largest jury–televote disagreement", `${disagreement.value}-place gap`, "edition", "Biggest difference between jury rank and televote rank inside one Grand Final.", disagreement.rows.map((item) => holder(item.row.country_id, item.row.edition_id, `Jury #${item.juryRank} · tele #${item.teleRank}`)));

  const juryWinnerLow = rankMetrics.filter((item) => item.juryRank === 1).map((item) => ({ ...item, metric: item.finalRank }));
  const lowestJuryWinner = tied(juryWinnerLow, "max");
  if (lowestJuryWinner.value != null && lowestJuryWinner.value > 1) add("jury-winner-low", "Lowest overall finish by a jury winner", `#${lowestJuryWinner.value}`, "unusual", "A jury winner that finished furthest down the final combined ranking.", lowestJuryWinner.rows.map((item) => holder(item.row.country_id, item.row.edition_id, `Jury #1 · final #${item.finalRank}`)));
  const teleWinnerLow = rankMetrics.filter((item) => item.teleRank === 1).map((item) => ({ ...item, metric: item.finalRank }));
  const lowestTeleWinner = tied(teleWinnerLow, "max");
  if (lowestTeleWinner.value != null && lowestTeleWinner.value > 1) add("tele-winner-low", "Lowest overall finish by a televote winner", `#${lowestTeleWinner.value}`, "unusual", "A televote winner that finished furthest down the final combined ranking.", lowestTeleWinner.rows.map((item) => holder(item.row.country_id, item.row.edition_id, `Tele #1 · final #${item.finalRank}`)));

  // Voting records use each show's configured maximum rather than assuming 12.
  const topScoreResolver = makeTopScoreResolver(shows);
  const receivedTop = new Map<string, number>();
  const givenTop = new Map<string, number>();
  const directional = new Map<string, number>();
  for (const vote of jury) {
    if (isTopScore(vote, topScoreResolver)) {
      receivedTop.set(vote.receiving_country_id, (receivedTop.get(vote.receiving_country_id) ?? 0) + 1);
      givenTop.set(vote.voter_country_id, (givenTop.get(vote.voter_country_id) ?? 0) + 1);
    }
    if (vote.voter_country_id && vote.receiving_country_id && vote.voter_country_id !== vote.receiving_country_id) {
      const key = `${vote.voter_country_id}>${vote.receiving_country_id}`;
      directional.set(key, (directional.get(key) ?? 0) + vote.points);
    }
  }
  const receivedExtreme = tied([...receivedTop.entries()].map(([countryId, metric]) => ({ countryId, metric })), "max");
  if (receivedExtreme.value != null) add("top-scores-received", "Most maximum scores received", String(receivedExtreme.value), "voting", "Counts the highest awardable jury score in each show's own voting scale.", receivedExtreme.rows.map((row) => holder(row.countryId)));
  const givenExtreme = tied([...givenTop.entries()].map(([countryId, metric]) => ({ countryId, metric })), "max");
  if (givenExtreme.value != null) add("top-scores-given", "Most maximum scores given", String(givenExtreme.value), "voting", "Counts how often a jury awarded the maximum available score for that show.", givenExtreme.rows.map((row) => holder(row.countryId)));

  const pairRows: Array<{ a: string; b: string; ab: number; ba: number; metric: number }> = [];
  for (let i = 0; i < countries.length; i += 1) {
    for (let j = i + 1; j < countries.length; j += 1) {
      const a = countries[i].id; const b = countries[j].id;
      const ab = directional.get(`${a}>${b}`) ?? 0; const ba = directional.get(`${b}>${a}`) ?? 0;
      if (!ab && !ba) continue;
      pairRows.push({ a, b, ab, ba, metric: ab + ba });
    }
  }
  const pairExtreme = tied(pairRows, "max");
  if (pairExtreme.value != null) {
    const pairHolders = pairExtreme.rows.flatMap((row) => [holder(row.a, undefined, `${row.ab} given · ${row.ba} returned`), holder(row.b, undefined, `${row.ba} given · ${row.ab} returned`)]);
    add("most-exchanged", "Most jury points exchanged by a pair", `${pairExtreme.value} pts`, "voting", "Total archived jury points flowing in both directions between the same two countries.", pairHolders);
  }
  const mutualExtreme = tied(pairRows.filter((row) => row.ab > 0 && row.ba > 0).map((row) => ({ ...row, metric: Math.min(row.ab, row.ba) })), "max");
  if (mutualExtreme.value != null) {
    const pairHolders = mutualExtreme.rows.flatMap((row) => [holder(row.a, undefined, `${row.ab} ↔ ${row.ba}`), holder(row.b, undefined, `${row.ba} ↔ ${row.ab}`)]);
    add("mutual-pair", "Strongest mutual jury pair", `${mutualExtreme.value} pts each-way floor`, "voting", "Ranks pairs by the weaker direction, so one-sided support cannot dominate this record.", pairHolders);
  }

  // Regional leaders use wins, then podiums, then final points. Exact ties on
  // all three measures are preserved.
  const regions = [...new Set(countries.map((country) => country.region).filter(Boolean))].sort();
  for (const region of regions) {
    const candidates = career.filter((row) => countryMap.get(row.countryId)?.region === region && row.finals > 0);
    if (!candidates.length) continue;
    const maxWins = Math.max(...candidates.map((row) => row.wins));
    const winPool = candidates.filter((row) => row.wins === maxWins);
    const maxPodiums = Math.max(...winPool.map((row) => row.podiums));
    const podiumPool = winPool.filter((row) => row.podiums === maxPodiums);
    const maxPoints = Math.max(...podiumPool.map((row) => row.points));
    const leaders = podiumPool.filter((row) => row.points === maxPoints);
    add(`regional-${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, `Most successful in ${region}`, `${maxWins} win${maxWins === 1 ? "" : "s"} · ${maxPodiums} podium${maxPodiums === 1 ? "" : "s"}`, "regional", "Region leader by wins, then podiums, then archived Grand Final points.", leaders.map((row) => holder(row.countryId, undefined, `${row.points} final pts`)));
  }

  return records;
}
