import type { ResultRow, Show } from "./data";

export type ProgressionStage = "heat" | "semi" | "final";

export type EditionProgressionPlacement = {
  editionId: string;
  countryId: string;
  rank: number;
  row: ResultRow;
  source: ProgressionStage | "other";
};

function normalise(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

export function isHeatShow(show: Pick<Show, "kind" | "name"> | null | undefined) {
  if (!show) return false;
  const kind = normalise(show.kind);
  const name = normalise(show.name);
  return (
    kind === "heat" ||
    kind === "heats" ||
    kind === "preliminary" ||
    /^heat(?:-|\s|\d|$)/.test(name)
  );
}

export function isSecondChanceShow(show: Pick<Show, "kind" | "name"> | null | undefined) {
  if (!show) return false;
  const kind = normalise(show.kind);
  const name = normalise(show.name);
  return kind === "second-chance" || kind === "second chance" || name.includes("second-chance") || name.includes("second chance");
}

export function isSemiShow(show: Pick<Show, "kind" | "name"> | null | undefined) {
  if (!show) return false;
  const kind = normalise(show.kind);
  return kind === "semi-final" || kind === "semi" || kind === "semifinal";
}

export function isFinalShow(show: Pick<Show, "kind" | "name"> | null | undefined) {
  if (!show) return false;
  const kind = normalise(show.kind);
  return kind === "grand-final" || kind === "final" || kind === "grand final";
}

export function progressionStage(show: Pick<Show, "kind" | "name"> | null | undefined): ProgressionStage | null {
  if (isFinalShow(show)) return "final";
  if (isSemiShow(show)) return "semi";
  if (isHeatShow(show)) return "heat";
  return null;
}

function strongerResult(current: ResultRow | undefined, candidate: ResultRow) {
  if (!current) return candidate;
  if (candidate.total_points !== current.total_points) {
    return candidate.total_points > current.total_points ? candidate : current;
  }
  if (candidate.televote_points !== current.televote_points) {
    return candidate.televote_points > current.televote_points ? candidate : current;
  }
  if (candidate.jury_points !== current.jury_points) {
    return candidate.jury_points > current.jury_points ? candidate : current;
  }
  const candidateRank = candidate.final_rank ?? Number.MAX_SAFE_INTEGER;
  const currentRank = current.final_rank ?? Number.MAX_SAFE_INTEGER;
  if (candidateRank !== currentRank) return candidateRank < currentRank ? candidate : current;
  return candidate.country_id.localeCompare(current.country_id) < 0 ? candidate : current;
}

function sortStageRows(rows: ResultRow[]) {
  return [...rows].sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.televote_points !== a.televote_points) return b.televote_points - a.televote_points;
    if (b.jury_points !== a.jury_points) return b.jury_points - a.jury_points;
    const aRank = a.final_rank ?? Number.MAX_SAFE_INTEGER;
    const bRank = b.final_rank ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return a.country_id.localeCompare(b.country_id);
  });
}

function bestRowsForStage(rows: ResultRow[], showById: Map<string, Show>, stage: ProgressionStage) {
  const byCountry = new Map<string, ResultRow>();
  for (const row of rows) {
    if (progressionStage(showById.get(row.show_id ?? "")) !== stage) continue;
    byCountry.set(row.country_id, strongerResult(byCountry.get(row.country_id), row));
  }
  return sortStageRows([...byCountry.values()]);
}

/**
 * Build one overall placement table per edition using the deepest main contest
 * stage a country reached.
 *
 * The progression is Final -> Semi-final -> Heat. Finalists retain the official
 * Grand Final rank. Semi-final NQs follow, ordered by their strongest semi-final
 * score. Heat NQs follow those, ordered by their strongest heat score.
 *
 * Second Chance is intentionally not a ranking tier. It is a route back into
 * the semi-final. A country qualifying through Second Chance is therefore
 * ranked by its later semi/final result; a country that still misses the semi
 * remains in the heat tier. This also means SSC3 does not need invented Second
 * Chance scores when only its qualifiers are known.
 */
export function buildEditionProgressionPlacements(results: ResultRow[], shows: Show[]) {
  const showById = new Map(shows.map((show) => [show.id, show]));
  const rowsByEdition = new Map<string, ResultRow[]>();
  for (const row of results) {
    rowsByEdition.set(row.edition_id, [...(rowsByEdition.get(row.edition_id) ?? []), row]);
  }

  const output = new Map<string, Map<string, EditionProgressionPlacement>>();

  for (const [editionId, rows] of rowsByEdition) {
    const placements = new Map<string, EditionProgressionPlacement>();
    const finalRows = rows
      .filter((row) => isFinalShow(showById.get(row.show_id ?? "")) && row.final_rank != null)
      .sort((a, b) => (a.final_rank ?? Number.MAX_SAFE_INTEGER) - (b.final_rank ?? Number.MAX_SAFE_INTEGER));

    let nextRank = 1;
    if (finalRows.length) {
      for (const row of finalRows) {
        const rank = row.final_rank!;
        placements.set(row.country_id, {
          editionId,
          countryId: row.country_id,
          rank,
          row,
          source: "final",
        });
        nextRank = Math.max(nextRank, rank + 1);
      }
    }

    const appendStage = (stage: "semi" | "heat") => {
      for (const row of bestRowsForStage(rows, showById, stage)) {
        if (placements.has(row.country_id)) continue;
        placements.set(row.country_id, {
          editionId,
          countryId: row.country_id,
          rank: nextRank,
          row,
          source: stage,
        });
        nextRank += 1;
      }
    };

    appendStage("semi");
    appendStage("heat");

    // Legacy editions without a recognised Final/Semi/Heat kind still keep a
    // single provisional placement rather than vanishing from country history.
    if (!placements.size) {
      const fallback = new Map<string, ResultRow>();
      for (const row of rows) {
        if (isSecondChanceShow(showById.get(row.show_id ?? ""))) continue;
        fallback.set(row.country_id, strongerResult(fallback.get(row.country_id), row));
      }
      for (const row of sortStageRows([...fallback.values()])) {
        placements.set(row.country_id, {
          editionId,
          countryId: row.country_id,
          rank: nextRank,
          row,
          source: "other",
        });
        nextRank += 1;
      }
    }

    output.set(editionId, placements);
  }

  return output;
}
