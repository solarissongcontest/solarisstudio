import type { Edition, JuryVote, ResultRow, Show } from "./data";
import type { FanRecord } from "./fan-records";
import type { V3Record, V3RecordProvenance } from "./v3-records";

function isFinal(show: Show | undefined) {
  return show?.kind === "grand-final" || show?.kind === "final";
}

function bestShow(
  showIds: readonly string[],
  showById: ReadonlyMap<string, Show>,
): Show | null {
  return showIds
    .map((id) => showById.get(id))
    .filter((show): show is Show => Boolean(show))
    .sort((a, b) => {
      const finalDifference = Number(isFinal(b)) - Number(isFinal(a));
      if (finalDifference !== 0) return finalDifference;
      return b.sort_order - a.sort_order || a.id.localeCompare(b.id);
    })[0] ?? null;
}

function provenanceForHolder(input: {
  record: FanRecord;
  countryId: string;
  editionId?: string;
  editionById: ReadonlyMap<string, Edition>;
  showById: ReadonlyMap<string, Show>;
  results: readonly ResultRow[];
  jury: readonly JuryVote[];
}): V3RecordProvenance | null {
  if (!input.editionId) return null;

  if (input.record.category === "voting") {
    const voteShowIds = input.jury
      .filter(
        (vote) =>
          vote.edition_id === input.editionId &&
          (vote.voter_country_id === input.countryId ||
            vote.receiving_country_id === input.countryId),
      )
      .flatMap((vote) => (vote.show_id ? [vote.show_id] : []));
    const votingShow = bestShow(voteShowIds, input.showById);
    if (votingShow) {
      return {
        kind: "voting",
        label: `${votingShow.name} voting matrix`,
        href: `/shows/${encodeURIComponent(votingShow.id)}?tab=matrix&from=results`,
      };
    }
  }

  const resultShowIds = input.results
    .filter(
      (row) =>
        row.edition_id === input.editionId &&
        row.country_id === input.countryId &&
        Boolean(row.show_id),
    )
    .flatMap((row) => (row.show_id ? [row.show_id] : []));
  const resultShow = bestShow(resultShowIds, input.showById);
  if (resultShow) {
    return {
      kind: "result",
      label: `${resultShow.name} result`,
      href: `/shows/${encodeURIComponent(resultShow.id)}?from=results`,
    };
  }

  const edition = input.editionById.get(input.editionId);
  if (edition?.slug) {
    return {
      kind: "edition",
      label:
        edition.edition_number == null
          ? `${edition.name} archive context`
          : `SSC ${edition.edition_number} archive context`,
      href: `/editions/${encodeURIComponent(edition.slug)}`,
    };
  }

  return null;
}

/**
 * Adds navigation provenance only from the same publication-safe archive rows
 * already used to calculate Records. It never invents source links for aggregate
 * career/streak records that have no exact edition holder context.
 */
export function attachV3RecordProvenance(input: {
  records: readonly FanRecord[];
  editions: readonly Edition[];
  shows: readonly Show[];
  results: readonly ResultRow[];
  jury: readonly JuryVote[];
}): V3Record[] {
  const editionById = new Map(input.editions.map((edition) => [edition.id, edition]));
  const showById = new Map(input.shows.map((show) => [show.id, show]));

  return input.records.map((record) => ({
    ...record,
    holders: record.holders.map((holder) => ({
      ...holder,
      provenance: provenanceForHolder({
        record,
        countryId: holder.countryId,
        editionId: holder.editionId,
        editionById,
        showById,
        results: input.results,
        jury: input.jury,
      }),
    })),
  }));
}
