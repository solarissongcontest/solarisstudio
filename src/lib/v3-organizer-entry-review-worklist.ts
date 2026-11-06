import {
  classifyOrganizerEntryReview,
  hasOutdatedOrganizerEntryReview,
  type OrganizerEntryReviewEvidence,
} from "./v3-organizer-entry-review-status";

export type OrganizerEntryWorkStatus =
  | "needs_review" | "changes_required" | "accepted" | "withdrawn" | "awaiting_entry";
export type OrganizerEntryWorkFilter =
  | "needs_review" | "revised" | "changes_required" | "accepted"
  | "withdrawn" | "awaiting_entry" | "all";

export type OrganizerEntryWorkCandidate = OrganizerEntryReviewEvidence & {
  id: string;
  artist?: string | null;
  song_title?: string | null;
  review_reason?: string | null;
  content_revision?: number | null;
};
export type OrganizerEntryWorkResponse = {
  id: string;
  country: string;
  instagram_username?: string | null;
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  internal_entries: OrganizerEntryWorkCandidate | null;
  national_finals: {
    nf_name?: string | null;
    winning_entry_id: string | null;
    national_final_entries: OrganizerEntryWorkCandidate[];
  } | null;
  submission_rounds?: { id: string; name: string; edition_id: string } | null;
  editions?: { id: string } | null;
};

export type OrganizerEntryWorkItem = {
  key: string;
  responseId: string;
  entryId: string | null;
  editionId: string;
  roundId: string | null;
  roundName: string;
  country: string;
  username: string | null;
  artist: string | null;
  songTitle: string | null;
  selection: "internal" | "national_final" | "unselected";
  nationalFinalName: string | null;
  revision: number | null;
  revised: boolean;
  outdatedReview: boolean;
  storedWinner: boolean;
  status: OrganizerEntryWorkStatus;
  note: string | null;
};

function statusOf(entry: OrganizerEntryWorkCandidate): OrganizerEntryWorkStatus {
  const status = classifyOrganizerEntryReview(entry);
  if (status === "removed") return "withdrawn";
  // Canonical acceptance remains historical evidence, but a missing title
  // must not turn the visible current song worklist green.
  if (status === "accepted") return entry.song_title?.trim() ? "accepted" : "needs_review";
  if (status === "declined") return "changes_required";
  return "needs_review";
}
function rank(status: OrganizerEntryWorkStatus): number {
  if (status === "needs_review") return 0;
  if (status === "changes_required") return 1;
  if (status === "awaiting_entry") return 2;
  if (status === "accepted") return 3;
  return 4;
}

/**
 * Candidate-level worklist based on the existing bounded, authorized
 * edition-scoped response projection. Does not grant permissions, fetch
 * history, turn drafts into current Entries, or claim an independent verified
 * backend state. "Accepted" requires a review of the current immutable Entry.
 */
export function buildOrganizerEntryReviewWorklist(
  responses: readonly OrganizerEntryWorkResponse[],
  editionId: string,
): OrganizerEntryWorkItem[] {
  if (!editionId) return [];
  const result: OrganizerEntryWorkItem[] = [];
  for (const row of responses) {
    if (!row.participating || row.editions?.id !== editionId ||
        (row.submission_rounds && row.submission_rounds.edition_id !== editionId)) continue;
    const base = {
      responseId: row.id, editionId, roundId: row.submission_rounds?.id ?? null,
      roundName: row.submission_rounds?.name ?? "Confirmation",
      country: row.country, username: row.instagram_username ?? null,
    };
    function addEntry(
      entry: OrganizerEntryWorkCandidate,
      selection: "internal" | "national_final",
      nationalFinalName: string | null,
      storedWinner: boolean,
    ) {
      const revision = typeof entry.content_revision === "number" &&
        Number.isInteger(entry.content_revision) && entry.content_revision > 0
        ? entry.content_revision : null;
      result.push({
        ...base, key: `${row.id}:${selection}:${entry.id}`, entryId: entry.id,
        artist: entry.artist ?? null, songTitle: entry.song_title ?? null,
        selection, nationalFinalName, revision, revised: revision !== null && revision > 1,
        outdatedReview: hasOutdatedOrganizerEntryReview(entry),
        storedWinner, status: statusOf(entry), note: entry.review_reason ?? null,
      });
    }
    function awaiting(selection: "internal" | "national_final" | "unselected") {
      result.push({
        ...base, key: `${row.id}:${selection}:awaiting`, entryId: null,
        artist: null, songTitle: null, selection,
        nationalFinalName: selection === "national_final"
          ? row.national_finals?.nf_name ?? null : null,
        revision: null, revised: false, outdatedReview: false,
        storedWinner: false, status: "awaiting_entry", note: null,
      });
    }
    if (row.selection_method === "internal") {
      if (row.entry_unknown || !row.internal_entries) awaiting("internal");
      else addEntry(row.internal_entries, "internal", null, false);
    } else if (row.selection_method === "national_final") {
      if (row.nf_entries_unknown || !row.national_finals) awaiting("national_final");
      else {
        const entries = row.national_finals.national_final_entries ?? [];
        if (!entries.length) awaiting("national_final");
        else for (const entry of entries) {
          addEntry(entry, "national_final", row.national_finals.nf_name ?? null,
            row.national_finals.winning_entry_id === entry.id &&
              !entry.removed && entry.review_status !== "removed");
        }
      }
    } else awaiting("unselected");
  }
  return result.sort((a,b) =>
    rank(a.status) - rank(b.status) ||
    Number(b.outdatedReview) - Number(a.outdatedReview) ||
    a.country.localeCompare(b.country) ||
    a.key.localeCompare(b.key));
}

export function matchesOrganizerEntryWorkFilter(
  item: OrganizerEntryWorkItem, filter: OrganizerEntryWorkFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "revised") {
    return item.status === "needs_review" && (item.revised || item.outdatedReview);
  }
  return item.status === filter;
}

export function matchesOrganizerEntryWorkSearch(
  item: OrganizerEntryWorkItem, query: string,
): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    item.country, item.username ?? "", item.artist ?? "", item.songTitle ?? "",
    item.nationalFinalName ?? "", item.roundName,
  ].join(" ").toLowerCase().includes(term);
}
