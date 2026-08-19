import type { Edition, JuryVote, Participant, ResultRow, Show, Televote } from "./data";
import { computeCanonicalCountryStats } from "./canonical-country-stats";
import type { HeadToHead, HeadToHeadRow } from "./stats";

type Options = {
  editions: Edition[];
  shows: Show[];
  participants: Participant[];
  results: ResultRow[];
  jury: JuryVote[];
  televote: Televote[];
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/**
 * Compares the same canonical overall placement used by country history.
 * A semi-final row can therefore never overwrite a country's Grand Final row
 * merely because it happened to be later in an API response.
 */
export function computeCanonicalHeadToHead(a: string, b: string, options: Options): HeadToHead {
  const statsA = computeCanonicalCountryStats(a, options);
  const statsB = computeCanonicalCountryStats(b, options);
  const bByEdition = new Map(statsB.timeline.map((point) => [point.editionId, point]));

  const rows: HeadToHeadRow[] = statsA.timeline
    .map((pointA) => {
      const pointB = bByEdition.get(pointA.editionId);
      if (!pointB) return null;
      const aRank = pointA.rank;
      const bRank = pointB.rank;
      return {
        editionId: pointA.editionId,
        editionNumber: pointA.editionNumber,
        label: pointA.label,
        aRank,
        bRank,
        diff: aRank != null && bRank != null ? aRank - bRank : null,
      } satisfies HeadToHeadRow;
    })
    .filter((row): row is HeadToHeadRow => row != null)
    .sort(
      (x, y) =>
        (x.editionNumber ?? Number.MAX_SAFE_INTEGER) -
        (y.editionNumber ?? Number.MAX_SAFE_INTEGER),
    );

  const valid = rows.filter(
    (row): row is HeadToHeadRow & { diff: number } => row.diff != null,
  );
  const aWins = valid.filter((row) => row.diff < 0).length;
  const bWins = valid.filter((row) => row.diff > 0).length;
  const ties = valid.filter((row) => row.diff === 0).length;

  const closest = valid.length
    ? valid.reduce((best, row) =>
        Math.abs(row.diff) < Math.abs(best.diff) ? row : best,
      )
    : null;
  const largest = valid.length
    ? valid.reduce((best, row) =>
        Math.abs(row.diff) > Math.abs(best.diff) ? row : best,
      )
    : null;

  return {
    a,
    b,
    sharedEditions: rows.length,
    aWins,
    bWins,
    ties,
    avgDiff: average(valid.map((row) => Math.abs(row.diff))),
    closest,
    largest,
    rows,
  };
}
