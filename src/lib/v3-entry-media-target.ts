import type { V3EntryCandidate, V3EntryProjection } from "./v3-entry";

export type V3EntryMediaTarget = {
  entryId: string;
  source: "internal_entry" | "national_final_winner";
};

/**
 * Canonical IDs come from the server projection. Presentation code must not
 * normalize malformed identity into a different value and then treat that as
 * authority, so whitespace is rejected rather than trimmed into validity.
 */
function canonicalId(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.trim() === value ? value : null;
}

function candidateMayOwnMedia(candidate: V3EntryCandidate): boolean {
  return Boolean(
    canonicalId(candidate.id) &&
      !candidate.removed &&
      candidate.reviewStatus !== "removed",
  );
}

/**
 * Resolve the one canonical Entry whose participant media may be managed from
 * the V3 Entry surface.
 *
 * Entry Media authorization and mutation remain server-owned. This helper only
 * binds presentation to identity already present in the caller-scoped Entry
 * projection. It deliberately refuses incomplete, malformed or contradictory
 * identity state rather than guessing from candidate order or whichever model
 * happens to be populated.
 */
export function resolveV3EntryMediaTarget(
  projection: V3EntryProjection,
): V3EntryMediaTarget | null {
  if (
    projection.state !== "ready" ||
    !projection.edition ||
    !canonicalId(projection.edition.id) ||
    !projection.delegation ||
    !canonicalId(projection.delegation.id) ||
    !projection.confirmation ||
    !canonicalId(projection.confirmation.submissionId)
  ) {
    return null;
  }

  const { selectionMethod, internalEntry, nationalFinal } = projection.confirmation;

  if (selectionMethod === "internal") {
    if (!internalEntry || nationalFinal || !candidateMayOwnMedia(internalEntry)) {
      return null;
    }

    return {
      entryId: internalEntry.id,
      source: "internal_entry",
    };
  }

  if (selectionMethod === "national_final") {
    if (internalEntry || !nationalFinal || !canonicalId(nationalFinal.id)) {
      return null;
    }

    const winnerEntryId = canonicalId(nationalFinal.winnerEntryId);
    if (!winnerEntryId || nationalFinal.entries.length === 0) return null;

    const candidateIds = nationalFinal.entries.map((candidate) =>
      canonicalId(candidate.id),
    );
    if (
      candidateIds.some((candidateId) => candidateId === null) ||
      new Set(candidateIds).size !== candidateIds.length
    ) {
      return null;
    }

    const winner = nationalFinal.entries.find(
      (candidate) => candidate.id === winnerEntryId,
    );
    if (!winner || !candidateMayOwnMedia(winner)) return null;

    return {
      entryId: winnerEntryId,
      source: "national_final_winner",
    };
  }

  return null;
}
