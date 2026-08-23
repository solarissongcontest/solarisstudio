import type { ResultRow, Show } from "./data";
import { isGrandFinalKind, isSemiFinalKind } from "./publication";

type RankedAllTimeRow = {
  countryId: string;
  totalPoints: number;
  appearances: number;
  averagePlacement: number | null;
  rank: number;
};

function resultPriority(row: ResultRow, showById: Map<string, Show>) {
  const kind = showById.get(row.show_id ?? "")?.kind;
  if (isGrandFinalKind(kind)) return 3;
  if (isSemiFinalKind(kind)) return 2;
  return 1;
}

function betterResult(
  candidate: ResultRow,
  current: ResultRow,
  showById: Map<string, Show>,
) {
  const candidatePriority = resultPriority(candidate, showById);
  const currentPriority = resultPriority(current, showById);
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority;

  if (candidate.final_rank != null && current.final_rank == null) return true;
  if (candidate.final_rank == null && current.final_rank != null) return false;
  if (
    candidate.final_rank != null &&
    current.final_rank != null &&
    candidate.final_rank !== current.final_rank
  ) {
    return candidate.final_rank < current.final_rank;
  }

  if (candidate.total_points !== current.total_points) {
    return candidate.total_points > current.total_points;
  }
  if (candidate.televote_points !== current.televote_points) {
    return candidate.televote_points > current.televote_points;
  }
  if (candidate.jury_points !== current.jury_points) {
    return candidate.jury_points > current.jury_points;
  }
  return candidate.id.localeCompare(current.id) < 0;
}

/**
 * Return one authoritative result row for each country in each edition.
 *
 * A Grand Final row always wins over the same entry's semi-final row. If the
 * country never reached the final, its strongest semi-final row is kept. This
 * is the result set that career/all-time analytics should use whenever the
 * question is about editions or participations rather than individual shows.
 */
export function canonicalEditionResults(results: ResultRow[], shows: Show[]) {
  const showById = new Map(shows.map((show) => [show.id, show]));
  const byCountryEdition = new Map<string, ResultRow>();

  for (const row of results) {
    const key = `${row.country_id}:${row.edition_id}`;
    const current = byCountryEdition.get(key);
    if (!current || betterResult(row, current, showById)) {
      byCountryEdition.set(key, row);
    }
  }

  return [...byCountryEdition.values()];
}

/** Grand Final-only rows, deduped to one row per country per edition. */
export function canonicalGrandFinalResults(results: ResultRow[], shows: Show[]) {
  const showById = new Map(shows.map((show) => [show.id, show]));
  return canonicalEditionResults(
    results.filter((row) => isGrandFinalKind(showById.get(row.show_id ?? "")?.kind)),
    shows,
  );
}

/**
 * All-time score ranking using the same one-result-per-edition rule as country
 * history: final score for finalists, otherwise the country's semi-final score.
 * Equal total scores share the same competition rank (1, 1, 3...).
 */
export function buildAllTimeScoreRanking(
  results: ResultRow[],
  shows: Show[],
): RankedAllTimeRow[] {
  const canonical = canonicalEditionResults(results, shows);
  const totals = new Map<
    string,
    { totalPoints: number; appearances: number; ranks: number[] }
  >();

  for (const row of canonical) {
    const current = totals.get(row.country_id) ?? {
      totalPoints: 0,
      appearances: 0,
      ranks: [],
    };
    current.totalPoints += row.total_points;
    current.appearances += 1;
    if (row.final_rank != null) current.ranks.push(row.final_rank);
    totals.set(row.country_id, current);
  }

  const ordered = [...totals.entries()]
    .map(([countryId, values]) => ({
      countryId,
      totalPoints: values.totalPoints,
      appearances: values.appearances,
      averagePlacement: values.ranks.length
        ? values.ranks.reduce((sum, value) => sum + value, 0) / values.ranks.length
        : null,
    }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      const aPlacement = a.averagePlacement ?? Number.MAX_SAFE_INTEGER;
      const bPlacement = b.averagePlacement ?? Number.MAX_SAFE_INTEGER;
      if (aPlacement !== bPlacement) return aPlacement - bPlacement;
      if (b.appearances !== a.appearances) return b.appearances - a.appearances;
      return a.countryId.localeCompare(b.countryId);
    });

  let previousScore: number | null = null;
  let competitionRank = 0;
  return ordered.map((row, index) => {
    if (previousScore == null || row.totalPoints !== previousScore) {
      competitionRank = index + 1;
      previousScore = row.totalPoints;
    }
    return { ...row, rank: competitionRank };
  });
}
