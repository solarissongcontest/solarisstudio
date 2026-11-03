import type { V3EntryCandidate, V3EntryConfirmationProjection, V3EntryLifecycle } from "./v3-entry";

export type V3EntryHistoryTarget = {
  targetType: "internal" | "national_final";
  entryId: string;
  label: string;
};

/**
 * Identify the exact Entry whose immutable history may be presented.
 * A National Final's first candidate is NOT a substitute for a canonical
 * winner or a uniquely affected review target.
 */
export function resolveV3EntryHistoryTarget(
  confirmation: V3EntryConfirmationProjection | null,
  lifecycle: V3EntryLifecycle,
): V3EntryHistoryTarget | null {
  if (!confirmation) return null;

  const label = (candidate: V3EntryCandidate) =>
    candidate.songTitle?.trim() || candidate.artist?.trim() || "Entry candidate";

  if (confirmation.selectionMethod === "internal") {
    const entry = confirmation.internalEntry;
    if (!entry?.id?.trim()) return null;
    return { targetType: "internal", entryId: entry.id, label: label(entry) };
  }

  if (confirmation.selectionMethod !== "national_final" || !confirmation.nationalFinal) {
    return null;
  }

  const candidates = confirmation.nationalFinal.entries;
  const exactCandidate = (id: string | null | undefined) => {
    if (!id?.trim()) return null;
    const matches = candidates.filter((candidate) => candidate.id === id);
    return matches.length === 1 ? matches[0] : null;
  };
  const affected = [...new Set(lifecycle.affectedCandidateIds)];
  const reviewedCandidate = affected.length === 1 ? exactCandidate(affected[0]) : null;
  const winner = exactCandidate(confirmation.nationalFinal.winnerEntryId);
  const target = reviewedCandidate ?? winner;
  if (!target) return null;

  return { targetType: "national_final", entryId: target.id, label: label(target) };
}
