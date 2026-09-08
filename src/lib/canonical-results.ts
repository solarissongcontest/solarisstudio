import type { ResultRow, Show } from "./data";
import { buildEditionProgressionPlacements } from "./edition-progression";

/**
 * Return the same one-row-per-country-per-edition result that public country
 * history uses. Finalists use their Grand Final row, semi-final non-qualifiers
 * use their strongest semi-final row, heat eliminations use their strongest
 * heat row, and legacy formats fall back to one non-Second-Chance result.
 *
 * Use this for edition/career analytics. Show-level voting analysis must keep
 * the real show rows because those are separate voting events.
 */
export function canonicalEditionResults(results: ResultRow[], shows: Show[]) {
  const progression = buildEditionProgressionPlacements(results, shows);
  const canonical: ResultRow[] = [];

  for (const placements of progression.values()) {
    for (const placement of placements.values()) canonical.push(placement.row);
  }

  return canonical;
}
