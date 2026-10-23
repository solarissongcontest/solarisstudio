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
 * the presentation to identity already present in the caller-scoped Entry
 * projection and deliberately refuses ambiguous/incomplete National Final
 * state rather than guessing from candidate order.
 */
export function resolveV3EntryMediaTarget(
  projection: V3EntryProjection,
): V3EntryMediaTarget | null {
  if (projection.state !== "ready" || !projection.confirmation) return null;

  const internalEntry = projection.confirmation.internalEntry;
  const nationalFinal = projection.confirmation.nationalFinal;

  // A projection containing both selection models is internally ambiguous.
  // Do not let presentation choose one and accidentally target the wrong Entry.
  if (internalEntry && nationalFinal) return null;

  if (internalEntry) {
    const entryId = nonBlankId(internalEntry.id);
    return entryId ? { entryId, source: "internal_entry" } : null;
  }

  if (!nationalFinal) return null;

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
