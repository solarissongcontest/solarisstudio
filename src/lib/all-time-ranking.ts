import { canonicalEditionResults } from "./canonical-results";
import type { ResultRow, Show } from "./data";
import { isFinalShow } from "./edition-progression";

export type AllTimeScoreRow = {
  countryId: string;
  score: number;
  appearances: number;
  finals: number;
  rank: number;
};

/**
 * All-time score is the cumulative score from one canonical result per country
 * per edition. A finalist contributes its Grand Final score; otherwise the
 * deepest main contest stage it reached contributes its score. This mirrors
 * public country history and avoids both double-counting semi + final and
 * erasing the points earned by non-qualifiers.
 *
 * Equal scores share the same competition rank (1, 2, 2, 4).
 */
export function buildAllTimeScoreRanking(shows: Show[], results: ResultRow[]): AllTimeScoreRow[] {
  const showById = new Map(shows.map((show) => [show.id, show]));
  const canonical = canonicalEditionResults(results, shows);
  const totals = new Map<string, { score: number; appearances: number; finals: number }>();

  for (const row of canonical) {
    if (!row.country_id) continue;
    const current = totals.get(row.country_id) ?? { score: 0, appearances: 0, finals: 0 };
    current.score += row.total_points;
    current.appearances += 1;
    if (isFinalShow(showById.get(row.show_id ?? ""))) current.finals += 1;
    totals.set(row.country_id, current);
  }

  const ordered = [...totals.entries()]
    .map(([countryId, values]) => ({ countryId, ...values, rank: 0 }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.finals - a.finals ||
        b.appearances - a.appearances ||
        a.countryId.localeCompare(b.countryId),
    );

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
