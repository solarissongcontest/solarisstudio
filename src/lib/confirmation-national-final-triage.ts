/**
 * Only a currently accepted, nonremoved National Final winner can make an
 * Organizer delegation ready. Historical/stale winning_entry_id values are
 * not evidence of a valid current result.
 */
export type ConfirmationNationalFinalTriage = "review" | "issue" | "ready" | "neutral";

export function deriveConfirmationNationalFinalTriage(
  entries: readonly { id: string; review_status: string | null; removed?: boolean | null }[],
  winningEntryId: string | null,
  entriesUnknown: boolean,
): ConfirmationNationalFinalTriage {
  const active = entries.filter((entry) => !entry.removed && entry.review_status !== "removed");
  if (entriesUnknown || active.length === 0) return "neutral";
  if (active.some((entry) => entry.review_status === "declined")) return "issue";
  if (active.some((entry) => entry.review_status !== "accepted")) return "review";
  if (!winningEntryId) return "neutral";
  return active.some((entry) => entry.id === winningEntryId) ? "ready" : "issue";
}
