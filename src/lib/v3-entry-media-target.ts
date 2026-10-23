import type { V3EntryProjection } from "./v3-entry";

export type V3EntryMediaTarget = {
  entryId: string;
  source: "internal_entry" | "national_final_winner";
};

function nonBlankId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve the one canonical Entry whose participant media may be managed from
 * the V3 Entry surface.
 *
 * Entry Media authority itself remains server-owned. This helper only binds
 * presentation to identity already present in the caller-scoped Entry
 * projection. It deliberately refuses incomplete or contradictory selection
 * state rather than guessing from candidate order or whichever object happens
 * to be populated.
 */
export function resolveV3EntryMediaTarget(
  projection: V3EntryProjection,
): V3EntryMediaTarget | null {
  if (
    projection.state !== "ready" ||
    !projection.edition ||
    !projection.delegation ||
    !projection.confirmation
  ) {
    return null;
  }

  const { selectionMethod, internalEntry, nationalFinal } = projection.confirmation;

  if (selectionMethod === "internal") {
    if (!internalEntry || nationalFinal) return null;
    const entryId = nonBlankId(internalEntry.id);
    return entryId ? { entryId, source: "internal_entry" } : null;
  }

  if (selectionMethod === "national_final") {
    if (internalEntry || !nationalFinal) return null;

    const winnerEntryId = nonBlankId(nationalFinal.winnerEntryId);
    if (!winnerEntryId) return null;

    const winner = nationalFinal.entries.find(
      (candidate) => nonBlankId(candidate.id) === winnerEntryId,
    );
    if (!winner) return null;

    return {
      entryId: winnerEntryId,
      source: "national_final_winner",
    };
  }

  return null;
}
