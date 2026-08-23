import type { ResultRow, Show } from "./data";

export type AllTimeScoreRow = {
  countryId: string;
  score: number;
  finals: number;
  rank: number;
};

function isFinal(kind?: string | null) {
  return kind === "grand-final" || kind === "final";
}

/**
 * All-time score is the cumulative total from published Grand Finals only.
 * One country can contribute at most one Grand Final score per edition.
 * Equal scores share the same competition rank (1, 2, 2, 4).
 */
export function buildAllTimeScoreRanking(shows: Show[], results: ResultRow[]): AllTimeScoreRow[] {
  const showById = new Map(shows.map((show) => [show.id, show]));
  const bestFinalByCountryEdition = new Map<string, ResultRow>();

  for (const result of results) {
    if (!isFinal(showById.get(result.show_id ?? "")?.kind)) continue;
    const key = `${result.country_id}:${result.edition_id}`;
    const current = bestFinalByCountryEdition.get(key);
    if (
      !current ||
      (result.final_rank != null && current.final_rank == null) ||
      (result.final_rank != null && current.final_rank != null && result.final_rank < current.final_rank) ||
      (result.final_rank === current.final_rank && result.total_points > current.total_points)
    ) {
      bestFinalByCountryEdition.set(key, result);
    }
  }

  const totals = new Map<string, { score: number; finals: number }>();
  for (const row of bestFinalByCountryEdition.values()) {
    const current = totals.get(row.country_id) ?? { score: 0, finals: 0 };
    current.score += row.total_points;
    current.finals += 1;
    totals.set(row.country_id, current);
  }

  const ordered = [...totals.entries()]
    .map(([countryId, values]) => ({ countryId, ...values, rank: 0 }))
    .sort((a, b) => b.score - a.score || b.finals - a.finals || a.countryId.localeCompare(b.countryId));

  let previousScore: number | null = null;
  let previousRank = 0;
  ordered.forEach((row, index) => {
    if (previousScore == null || row.score !== previousScore) previousRank = index + 1;
    row.rank = previousRank;
    previousScore = row.score;
  });

  return ordered;
}

export function allTimeScoreForCountry(countryId: string, shows: Show[], results: ResultRow[]) {
  return buildAllTimeScoreRanking(shows, results).find((row) => row.countryId === countryId) ?? null;
}
