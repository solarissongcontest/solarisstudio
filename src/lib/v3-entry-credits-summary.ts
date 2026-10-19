import type { EntryCredit } from "./ssc";
import type { V3EntryProjection } from "./v3-entry";

export type V3EntryCreditSummaryRow = {
  id: string;
  label: string;
  credits: readonly EntryCredit[];
  selected: boolean;
};

/**
 * Build current participant-facing Credits rows only from the caller-scoped
 * Entry projection. Empty/missing Credits are a valid backwards-compatible
 * value and are never reconstructed from drafts, public archive rows or browser
 * state.
 */
export function v3EntryCreditSummaryRows(
  projection: V3EntryProjection,
): readonly V3EntryCreditSummaryRow[] {
  const confirmation = projection.confirmation;
  if (projection.state !== "ready" || !confirmation) return [];

  if (confirmation.internalEntry) {
    const entry = confirmation.internalEntry;
    const credits = entry.credits ?? [];
    return credits.length
      ? [{
          id: entry.id,
          label: entry.songTitle ?? entry.artist ?? "Current entry",
          credits,
          selected: true,
        }]
      : [];
  }

  const nationalFinal = confirmation.nationalFinal;
  if (!nationalFinal) return [];

  return nationalFinal.entries.flatMap((entry) => {
    const credits = entry.credits ?? [];
    return credits.length
      ? [{
          id: entry.id,
          label: entry.songTitle ?? entry.artist ?? "National final entry",
          credits,
          selected: entry.id === nationalFinal.winnerEntryId,
        }]
      : [];
  });
}
