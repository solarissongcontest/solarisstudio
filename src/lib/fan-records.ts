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

export type FanRecordCategory =
  | "career"
  | "streaks"
  | "edition"
  | "voting"
  | "regional"
  | "unusual";

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

type MetricRow<T> = { data: T; metric: number };

type CareerRow = {
  countryId: string;
  participations: number;
  finals: number;
  wins: number;
  podiums: number;
  top5: number;
  top10: number;
  points: number;
  averageRank: number | null;
  averagePoints: number | null;
};

type RankedResult = {
  row: ResultRow;
  juryRank: number;
  teleRank: number;
  finalRank: number;
};

function extreme<T>(rows: MetricRow<T>[], mode: "max" | "min", epsilon = 1e-9) {
  if (!rows.length) return { value: null as number | null, rows: [] as MetricRow<T>[] };
  const value = mode === "max"
    ? Math.max(...rows.map((row) => row.metric))
    : Math.min(...rows.map((row) => row.metric));
  return {
    value,
    rows: rows.filter((row) => Math.abs(row.metric - value) <= epsilon),
  };
}

function competitionRanks(
  rows: ResultRow[],
  key: "jury_points" | "televote_points" | "total_points",
) {
  const sorted = [...rows].sort(
    (a, b) => b[key] - a[key] || a.country_id.localeCompare(b.country_id),
  );
  const ranks = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  sorted.forEach((row, index) => {
    if (previous == null || previous !== row[key]) rank = index + 1;
    previous = row[key];
    ranks.set(row.country_id, rank);
  });
  return ranks;
}

function consecutiveSegments(
  histories: Map<string, Map<number, boolean>>,
  wanted: boolean,
) {
  const segments: Array<{ countryId: string; from: number; to: number; length: number }> = [];
  for (const [countryId, history] of histories) {
    const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
    let from: number | null = null;
    let to: number | null = null;
    let length = 0;
    for (const [editionNumber, matches] of ordered) {
      if (matches === wanted && to != null && editionNumber === to + 1) {
        to = editionNumber;
        length += 1;
      } else if (matches === wanted) {
        from = editionNumber;
        to = editionNumber;
        length = 1;
      } else {
        from = null;
        to = null;
        length = 0;
      }
      if (from != null && to != null && length > 0) {
        segments.push({ countryId, from, to, length });
      }
    }
  }
  return segments;
}

export function buildFanRecords(input: Input): FanRecord[] {
  const { countries, editions, shows, participants, results, jury } = input;
  const countryMap = new Map(countries.map((country) => [country.id, country]));
  const editionMap = new Map(editions.map((edition) => [edition.id, edition]));
  const showMap = new Map(shows.map((show) => [show.id, show]));
  const finalShowIds = new Set(
    shows
      .filter((show) => show.kind === "grand-final" || show.kind === "final")
      .map((show) => show.id),
  );
  const semiShowIds = new Set(
    shows
      .filter((show) => show.kind === "semi-final" || show.kind === "semi")
      .map((show) => show.id),
  );
  const finalRows = results.filter(
    (row) => Boolean(row.show_id && finalShowIds.has(row.show_id)) && row.final_rank != null,
  );
  const records: FanRecord[] = [];

  const makeHolder = (
    countryId: string,
    editionId?: string,
    context?: string | null,
  ): FanRecordHolder | null => {
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
    possibleHolders: Array<FanRecordHolder | null>,
  ) => {
    const holders = possibleHolders.filter(
      (holder): holder is FanRecordHolder => Boolean(holder),
    );
    if (!holders.length) return;
    records.push({ id, label, value, category, explanation, holders });
  };

  const finalByCountry = new Map<string, ResultRow[]>();
  for (const row of finalRows) {
    finalByCountry.set(row.country_id, [...(finalByCountry.get(row.country_id) ?? []), row]);
  }

  const participationKeys = new Set<string>();
  participants.forEach((entry) => participationKeys.add(`${entry.country_id}:${entry.edition_id}`));
  finalRows.forEach((row) => participationKeys.add(`${row.country_id}:${row.edition_id}`));
  const participationCounts = new Map<string, number>();
  participationKeys.forEach((key) => {
    const countryId = key.split(":")[0];
    participationCounts.set(countryId, (participationCounts.get(countryId) ?? 0) + 1);
  });

  const career: CareerRow[] = countries.map((country) => {
    const rows = finalByCountry.get(country.id) ?? [];
    const points = rows.reduce((sum, row) => sum + row.total_points, 0);
    return {
      countryId: country.id,
      participations: participationCounts.get(country.id) ?? 0,
      finals: rows.length,
      wins: rows.filter((row) => row.final_rank === 1).length,
      podiums: rows.filter((row) => (row.final_rank ?? 999) <= 3).length,
      top5: rows.filter((row) => (row.final_rank ?? 999) <= 5).length,
      top10: rows.filter((row) => (row.final_rank ?? 999) <= 10).length,
      points,
      averageRank: rows.length
        ? rows.reduce((sum, row) => sum + (row.final_rank ?? 0), 0) / rows.length
        : null,
      averagePoints: rows.length ? points / rows.length : null,
    };
  });

  const addCareer = (
    id: string,
    label: string,
    field: "participations" | "finals" | "wins" | "podiums" | "top5" | "top10" | "points",
    explanation: string,
  ) => {
    const pick = extreme(
      career
        .filter((row) => row[field] > 0)
        .map((row) => ({ data: row, metric: row[field] })),
      "max",
    );
    if (pick.value == null) return;
    add(
      id,
      label,
      String(pick.value),
      "career",
      explanation,
      pick.rows.map(({ data }) =>
        makeHolder(
          data.countryId,
          undefined,
          `${data.finals} archived final${data.finals === 1 ? "" : "s"}`,
        ),
      ),
    );
  };

  addCareer("participations", "Most SSC participations", "participations", "Unique country participations by edition. Semi-final and final are the same participation.");
  addCareer("finals", "Most Grand Final appearances", "finals", "Archived Grand Final appearances.");
  addCareer("wins", "Most wins", "wins", "Grand Final victories in the loaded archive.");
  addCareer("podiums", "Most podium finishes", "podiums", "Grand Final finishes in the top three.");
  addCareer("top5", "Most top-5 finishes", "top5", "Grand Final finishes from 1st to 5th.");
  addCareer("top10", "Most top-10 finishes", "top10", "Grand Final finishes from 1st to 10th.");
  addCareer("career-points", "Most career final points", "points", "Total points across archived Grand Finals.");

  const averageRankPool = career.filter((row) => row.averageRank != null && row.finals >= 2);
  const averageRankRows = averageRankPool.length
    ? averageRankPool
    : career.filter((row) => row.averageRank != null);
  const bestAverage = extreme(
    averageRankRows.map((row) => ({ data: row, metric: row.averageRank ?? 999 })),
    "min",
    0.0001,
  );
  if (bestAverage.value != null) {
    add(
      "best-average-rank",
      "Best average final placement",
      `#${bestAverage.value.toFixed(1)}`,
      "career",
      "Lowest average Grand Final placement. Two or more finals are preferred when the archive allows it.",
      bestAverage.rows.map(({ data }) => makeHolder(data.countryId, undefined, `${data.finals} archived finals`)),
    );
  }

  const averagePointsPool = career.filter((row) => row.averagePoints != null && row.finals >= 2);
  const averagePointsRows = averagePointsPool.length
    ? averagePointsPool
    : career.filter((row) => row.averagePoints != null);
  const bestPointAverage = extreme(
    averagePointsRows.map((row) => ({ data: row, metric: row.averagePoints ?? 0 })),
    "max",
    0.0001,
  );
  if (bestPointAverage.value != null) {
    add(
      "best-average-points",
      "Highest average final points",
      bestPointAverage.value.toFixed(1),
      "career",
      "Average points per archived Grand Final.",
      bestPointAverage.rows.map(({ data }) => makeHolder(data.countryId, undefined, `${data.finals} archived finals`)),
    );
  }

  const byShow = new Map<string, ResultRow[]>();
  finalRows.forEach((row) => {
    if (!row.show_id) return;
    byShow.set(row.show_id, [...(byShow.get(row.show_id) ?? []), row]);
  });

  const lastPlaces = new Map<string, number>();
  for (const rows of byShow.values()) {
    const lastRank = Math.max(...rows.map((row) => row.final_rank ?? 0));
    rows
      .filter((row) => row.final_rank === lastRank)
      .forEach((row) => lastPlaces.set(row.country_id, (lastPlaces.get(row.country_id) ?? 0) + 1));
  }
  const mostLast = extreme(
    [...lastPlaces.entries()].map(([countryId, metric]) => ({ data: countryId, metric })),
    "max",
  );
  if (mostLast.value != null) {
    add("last-places", "Most last-place finishes", String(mostLast.value), "career", "Every country sharing a tied last place is counted.", mostLast.rows.map(({ data }) => makeHolder(data)));
  }

  const editionNumbers = new Map(editions.map((edition) => [edition.id, edition.edition_number]));
  const rankHistories = new Map<string, Map<number, number>>();
  finalRows.forEach((row) => {
    const number = editionNumbers.get(row.edition_id);
    if (number == null || row.final_rank == null) return;
    const history = rankHistories.get(row.country_id) ?? new Map<number, number>();
    history.set(number, row.final_rank);
    rankHistories.set(row.country_id, history);
  });

  const addRankStreak = (id: string, label: string, maximumRank: number, explanation: string) => {
    const booleanHistories = new Map<string, Map<number, boolean>>();
    rankHistories.forEach((history, countryId) => {
      booleanHistories.set(
        countryId,
        new Map([...history.entries()].map(([number, rank]) => [number, rank <= maximumRank])),
      );
    });
    const segments = consecutiveSegments(booleanHistories, true);
    const pick = extreme(
      segments.map((segment) => ({ data: segment, metric: segment.length })),
      "max",
    );
    if (pick.value == null) return;
    const unique = new Map<string, (typeof pick.rows)[number]>();
    pick.rows.forEach((row) => unique.set(`${row.data.countryId}:${row.data.from}:${row.data.to}`, row));
    add(
      id,
      label,
      `${pick.value} edition${pick.value === 1 ? "" : "s"}`,
      "streaks",
      explanation,
      [...unique.values()].map(({ data }) =>
        makeHolder(data.countryId, undefined, data.from === data.to ? `SSC ${data.from}` : `SSC ${data.from}–${data.to}`),
      ),
    );
  };

  addRankStreak("win-streak", "Longest winning streak", 1, "Consecutive editions won.");
  addRankStreak("podium-streak", "Longest podium streak", 3, "Consecutive podium finishes.");
  addRankStreak("top5-streak", "Longest top-5 streak", 5, "Consecutive top-five finishes.");
  addRankStreak("top10-streak", "Longest top-10 streak", 10, "Consecutive top-ten finishes.");

  const finalPresence = new Set(finalRows.map((row) => `${row.country_id}:${row.edition_id}`));
  const qualificationHistories = new Map<string, Map<number, boolean>>();
  participants.forEach((participant) => {
    if (!participant.show_id || !semiShowIds.has(participant.show_id)) return;
    const number = editionNumbers.get(participant.edition_id);
    if (number == null) return;
    const qualified = participant.qualified === true || finalPresence.has(`${participant.country_id}:${participant.edition_id}`)
      ? true
      : participant.qualified === false
        ? false
        : null;
    if (qualified == null) return;
    const history = qualificationHistories.get(participant.country_id) ?? new Map<number, boolean>();
    history.set(number, history.get(number) === true ? true : qualified);
    qualificationHistories.set(participant.country_id, history);
  });

  const addQualificationStreak = (
    id: string,
    label: string,
    wanted: boolean,
    explanation: string,
  ) => {
    const segments = consecutiveSegments(qualificationHistories, wanted);
    const pick = extreme(
      segments.map((segment) => ({ data: segment, metric: segment.length })),
      "max",
    );
    if (pick.value == null) return;
    const unique = new Map<string, (typeof pick.rows)[number]>();
    pick.rows.forEach((row) => unique.set(`${row.data.countryId}:${row.data.from}:${row.data.to}`, row));
    add(
      id,
      label,
      `${pick.value} edition${pick.value === 1 ? "" : "s"}`,
      "streaks",
      explanation,
      [...unique.values()].map(({ data }) =>
        makeHolder(data.countryId, undefined, data.from === data.to ? `SSC ${data.from}` : `SSC ${data.from}–${data.to}`),
      ),
    );
  };

  addQualificationStreak("qualification-streak", "Longest qualification streak", true, "Consecutive semi-final editions reaching the final.");
  addQualificationStreak("nq-streak", "Longest non-qualification streak", false, "Consecutive semi-final editions ending in non-qualification.");

  const currentQualificationRows: MetricRow<{ countryId: string; from: number; to: number }>[] = [];
  qualificationHistories.forEach((history, countryId) => {
    const ordered = [...history.entries()].sort((a, b) => a[0] - b[0]);
    if (!ordered.length || ordered[ordered.length - 1][1] !== true) return;
    let from = ordered[ordered.length - 1][0];
    const to = from;
    let length = 1;
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      const [number, qualified] = ordered[index];
      if (!qualified || number !== from - 1) break;
      from = number;
      length += 1;
    }
    currentQualificationRows.push({ data: { countryId, from, to }, metric: length });
  });
  const currentQualification = extreme(currentQualificationRows, "max");
  if (currentQualification.value != null) {
    add(
      "current-qualification-streak",
      "Longest current qualification streak",
      `${currentQualification.value} edition${currentQualification.value === 1 ? "" : "s"}`,
      "streaks",
      "Active run ending at that country's latest archived semi-final.",
      currentQualification.rows.map(({ data }) =>
        makeHolder(data.countryId, undefined, data.from === data.to ? `SSC ${data.to}` : `SSC ${data.from}–${data.to}`),
      ),
    );
  }

  const addResultExtreme = (
    id: string,
    label: string,
    key: "total_points" | "jury_points" | "televote_points",
    mode: "max" | "min",
    category: FanRecordCategory,
    explanation: string,
    pool: ResultRow[] = finalRows,
  ) => {
    const pick = extreme(pool.map((row) => ({ data: row, metric: row[key] })), mode);
    if (pick.value == null) return;
    add(id, label, `${pick.value} pts`, category, explanation, pick.rows.map(({ data }) => makeHolder(data.country_id, data.edition_id)));
  };

  addResultExtreme("highest-score", "Highest Grand Final score", "total_points", "max", "edition", "Largest combined score in one archived Grand Final.");
  addResultExtreme("lowest-score", "Lowest Grand Final score", "total_points", "min", "edition", "Smallest combined score attached to a ranked Grand Final result.");
  addResultExtreme("highest-jury", "Highest jury score", "jury_points", "max", "edition", "Largest jury component in one archived Grand Final.");
  addResultExtreme("highest-tele", "Highest televote score", "televote_points", "max", "edition", "Largest televote component in one archived Grand Final.");
  addResultExtreme("points-without-win", "Most points without winning", "total_points", "max", "unusual", "Highest combined score that still did not win.", finalRows.filter((row) => row.final_rank !== 1));
  addResultExtreme("lowest-winner", "Lowest-scoring winner", "total_points", "min", "unusual", "Smallest combined score among archived Grand Final winners.", finalRows.filter((row) => row.final_rank === 1));

  const marginRows: MetricRow<ResultRow>[] = [];
  for (const rows of byShow.values()) {
    const sorted = [...rows].sort((a, b) => b.total_points - a.total_points);
    if (sorted[0] && sorted[1]) {
      marginRows.push({ data: sorted[0], metric: sorted[0].total_points - sorted[1].total_points });
    }
  }
  const closest = extreme(marginRows, "min");
  if (closest.value != null) {
    add("closest-win", "Closest winning margin", `${closest.value} pt${closest.value === 1 ? "" : "s"}`, "edition", "Smallest first-to-second gap inside one Grand Final.", closest.rows.map(({ data }) => makeHolder(data.country_id, data.edition_id)));
  }
  const largest = extreme(marginRows, "max");
  if (largest.value != null) {
    add("largest-win", "Largest winning margin", `${largest.value} pts`, "edition", "Largest first-to-second gap inside one Grand Final.", largest.rows.map(({ data }) => makeHolder(data.country_id, data.edition_id)));
  }

  const rankedResults: RankedResult[] = [];
  for (const rows of byShow.values()) {
    const juryRanks = competitionRanks(rows, "jury_points");
    const teleRanks = competitionRanks(rows, "televote_points");
    const totalRanks = competitionRanks(rows, "total_points");
    rows.forEach((row) => {
      rankedResults.push({
        row,
        juryRank: juryRanks.get(row.country_id) ?? rows.length,
        teleRank: teleRanks.get(row.country_id) ?? rows.length,
        finalRank: row.final_rank ?? totalRanks.get(row.country_id) ?? rows.length,
      });
    });
  }

  const addRankMovement = (
    id: string,
    label: string,
    metric: (item: RankedResult) => number,
    explanation: string,
    context: (item: RankedResult) => string,
  ) => {
    const pick = extreme(
      rankedResults
        .map((item) => ({ data: item, metric: metric(item) }))
        .filter((item) => item.metric > 0),
      "max",
    );
    if (pick.value == null) return;
    add(
      id,
      label,
      `${pick.value} place${pick.value === 1 ? "" : "s"}`,
      "edition",
      explanation,
      pick.rows.map(({ data }) => makeHolder(data.row.country_id, data.row.edition_id, context(data))),
    );
  };

  addRankMovement("televote-rescue", "Biggest televote rescue", (item) => item.juryRank - item.finalRank, "Largest rise from jury rank to final rank.", (item) => `Jury #${item.juryRank} → final #${item.finalRank}`);
  addRankMovement("post-jury-collapse", "Biggest post-jury collapse", (item) => item.finalRank - item.juryRank, "Largest fall from jury rank to final rank.", (item) => `Jury #${item.juryRank} → final #${item.finalRank}`);

  const disagreement = extreme(
    rankedResults
      .map((item) => ({ data: item, metric: Math.abs(item.juryRank - item.teleRank) }))
      .filter((item) => item.metric > 0),
    "max",
  );
  if (disagreement.value != null) {
    add("jury-tele-gap", "Largest jury–televote disagreement", `${disagreement.value}-place gap`, "edition", "Biggest gap between jury rank and televote rank in one Grand Final.", disagreement.rows.map(({ data }) => makeHolder(data.row.country_id, data.row.edition_id, `Jury #${data.juryRank} · tele #${data.teleRank}`)));
  }

  const lowestJuryWinner = extreme(
    rankedResults.filter((item) => item.juryRank === 1).map((item) => ({ data: item, metric: item.finalRank })),
    "max",
  );
  if (lowestJuryWinner.value != null && lowestJuryWinner.value > 1) {
    add("jury-winner-low", "Lowest overall finish by a jury winner", `#${lowestJuryWinner.value}`, "unusual", "A jury winner that finished furthest down the combined ranking.", lowestJuryWinner.rows.map(({ data }) => makeHolder(data.row.country_id, data.row.edition_id, `Jury #1 · final #${data.finalRank}`)));
  }
  const lowestTeleWinner = extreme(
    rankedResults.filter((item) => item.teleRank === 1).map((item) => ({ data: item, metric: item.finalRank })),
    "max",
  );
  if (lowestTeleWinner.value != null && lowestTeleWinner.value > 1) {
    add("tele-winner-low", "Lowest overall finish by a televote winner", `#${lowestTeleWinner.value}`, "unusual", "A televote winner that finished furthest down the combined ranking.", lowestTeleWinner.rows.map(({ data }) => makeHolder(data.row.country_id, data.row.edition_id, `Tele #1 · final #${data.finalRank}`)));
  }

  const topScoreResolver = makeTopScoreResolver(shows);
  const maximumReceived = new Map<string, number>();
  const maximumGiven = new Map<string, number>();
  const directional = new Map<string, number>();
  jury.forEach((vote) => {
    if (isTopScore(vote, topScoreResolver)) {
      maximumReceived.set(vote.receiving_country_id, (maximumReceived.get(vote.receiving_country_id) ?? 0) + 1);
      maximumGiven.set(vote.voter_country_id, (maximumGiven.get(vote.voter_country_id) ?? 0) + 1);
    }
    if (vote.voter_country_id && vote.receiving_country_id && vote.voter_country_id !== vote.receiving_country_id) {
      const key = `${vote.voter_country_id}>${vote.receiving_country_id}`;
      directional.set(key, (directional.get(key) ?? 0) + vote.points);
    }
  });

  const maxReceived = extreme([...maximumReceived.entries()].map(([countryId, metric]) => ({ data: countryId, metric })), "max");
  if (maxReceived.value != null) add("top-scores-received", "Most maximum scores received", String(maxReceived.value), "voting", "Counts each show's actual maximum jury score, not a hard-coded 12.", maxReceived.rows.map(({ data }) => makeHolder(data)));
  const maxGiven = extreme([...maximumGiven.entries()].map(([countryId, metric]) => ({ data: countryId, metric })), "max");
  if (maxGiven.value != null) add("top-scores-given", "Most maximum scores given", String(maxGiven.value), "voting", "How often a jury awarded the maximum score available in that show.", maxGiven.rows.map(({ data }) => makeHolder(data)));

  const pairMetrics: MetricRow<{ a: string; b: string; ab: number; ba: number }>[] = [];
  for (let i = 0; i < countries.length; i += 1) {
    for (let j = i + 1; j < countries.length; j += 1) {
      const a = countries[i].id;
      const b = countries[j].id;
      const ab = directional.get(`${a}>${b}`) ?? 0;
      const ba = directional.get(`${b}>${a}`) ?? 0;
      if (!ab && !ba) continue;
      pairMetrics.push({ data: { a, b, ab, ba }, metric: ab + ba });
    }
  }
  const mostExchanged = extreme(pairMetrics, "max");
  if (mostExchanged.value != null) {
    add(
      "most-exchanged",
      "Most jury points exchanged by a pair",
      `${mostExchanged.value} pts`,
      "voting",
      "Total archived jury points flowing both directions between the same two countries.",
      mostExchanged.rows.flatMap(({ data }) => [
        makeHolder(data.a, undefined, `${data.ab} given · ${data.ba} returned`),
        makeHolder(data.b, undefined, `${data.ba} given · ${data.ab} returned`),
      ]),
    );
  }

  const mutualMetrics = pairMetrics
    .filter(({ data }) => data.ab > 0 && data.ba > 0)
    .map(({ data }) => ({ data, metric: Math.min(data.ab, data.ba) }));
  const strongestMutual = extreme(mutualMetrics, "max");
  if (strongestMutual.value != null) {
    add(
      "mutual-pair",
      "Strongest mutual jury pair",
      `${strongestMutual.value} pts each-way floor`,
      "voting",
      "Ranks pairs by the weaker direction so one-sided support cannot dominate.",
      strongestMutual.rows.flatMap(({ data }) => [
        makeHolder(data.a, undefined, `${data.ab} ↔ ${data.ba}`),
        makeHolder(data.b, undefined, `${data.ba} ↔ ${data.ab}`),
      ]),
    );
  }

  const regions = [...new Set(countries.map((country) => country.region).filter(Boolean))].sort();
  regions.forEach((region) => {
    const candidates = career.filter(
      (row) => countryMap.get(row.countryId)?.region === region && row.finals > 0,
    );
    if (!candidates.length) return;
    const wins = Math.max(...candidates.map((row) => row.wins));
    const afterWins = candidates.filter((row) => row.wins === wins);
    const podiums = Math.max(...afterWins.map((row) => row.podiums));
    const afterPodiums = afterWins.filter((row) => row.podiums === podiums);
    const points = Math.max(...afterPodiums.map((row) => row.points));
    const leaders = afterPodiums.filter((row) => row.points === points);
    add(
      `regional-${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      `Most successful in ${region}`,
      `${wins} win${wins === 1 ? "" : "s"} · ${podiums} podium${podiums === 1 ? "" : "s"}`,
      "regional",
      "Region leader by wins, then podiums, then archived Grand Final points.",
      leaders.map((row) => makeHolder(row.countryId, undefined, `${row.points} final pts`)),
    );
  });

  // Keep a tiny sanity check in development: a result should never point to a
  // missing show in a way that changes the record categories. The map is also
  // intentionally kept above because records may later expose show context.
  void showMap;

  return records;
}
