/**
 * Organizer Entry review summaries are projections, never approval authority.
 * A decision can describe the current Entry only when the canonical server
 * binds it to that exact immutable Entry version. Legacy/unbound decisions
 * remain visible in detail history but cannot count as current approval.
 */
export type OrganizerEntryReviewEvidence = {
  review_status?: string | null;
  current_version_id?: string | null;
  reviewed_version_id?: string | null;
  removed?: boolean | null;
};

export type OrganizerEntryReviewState =
  | "accepted"
  | "declined"
  | "needs_review"
  | "removed";

export type OrganizerResponseReviewState = "review" | "issue" | "ready" | "neutral";

export type OrganizerResponseReviewEvidence = {
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  internal_entries: (OrganizerEntryReviewEvidence & { song_title?: string | null }) | null;
  national_finals: {
    winning_entry_id: string | null;
    national_final_entries: (OrganizerEntryReviewEvidence & { id: string })[];
  } | null;
};

export function classifyOrganizerEntryReview(
  entry: OrganizerEntryReviewEvidence,
): OrganizerEntryReviewState {
  if (entry.removed || entry.review_status === "removed") return "removed";
  if (entry.review_status === "accepted" || entry.review_status === "declined") {
    const current = entry.current_version_id?.trim();
    const reviewed = entry.reviewed_version_id?.trim();
    if (!current || !reviewed || current !== reviewed) return "needs_review";
    return entry.review_status;
  }
  return "needs_review";
}

export function hasOutdatedOrganizerEntryReview(
  entry: OrganizerEntryReviewEvidence,
): boolean {
  return (entry.review_status === "accepted" || entry.review_status === "declined") &&
    classifyOrganizerEntryReview(entry) === "needs_review";
}

/**
 * This is triage evidence for the selected response only, not a server verdict.
 * A historical review on an inactive selection or removed NF candidate cannot
 * make the current response appear to need version-related attention.
 */
export function hasOutdatedOrganizerResponseReview(
  response: OrganizerResponseReviewEvidence,
): boolean {
  if (!response.participating) return false;
  if (response.selection_method === "internal") {
    return Boolean(response.internal_entries &&
      !response.entry_unknown &&
      hasOutdatedOrganizerEntryReview(response.internal_entries));
  }
  if (response.selection_method === "national_final") {
    if (response.nf_entries_unknown) return false;
    return (response.national_finals?.national_final_entries ?? [])
      .filter((entry) => !entry.removed && entry.review_status !== "removed")
      .some(hasOutdatedOrganizerEntryReview);
  }
  return false;
}

export function deriveOrganizerResponseReviewState(
  response: OrganizerResponseReviewEvidence,
): OrganizerResponseReviewState {
  if (!response.participating) return "neutral";

  if (response.selection_method === "internal") {
    const entry = response.internal_entries;
    if (!entry?.song_title || response.entry_unknown) return "neutral";
    const state = classifyOrganizerEntryReview(entry);
    if (state === "declined" || state === "removed") return "issue";
    return state === "accepted" ? "ready" : "review";
  }

  if (response.selection_method === "national_final") {
    const entries = (response.national_finals?.national_final_entries ?? []).filter(
      (entry) => !entry.removed && entry.review_status !== "removed",
    );
    if (!entries.length || response.nf_entries_unknown) return "neutral";
    const states = entries.map(classifyOrganizerEntryReview);
    if (states.includes("declined")) return "issue";
    if (states.some((state) => state !== "accepted")) return "review";
    // A missing or foreign winner must not make the delegation look ready.
    const winnerId = response.national_finals?.winning_entry_id;
    return winnerId && entries.some((entry) => entry.id === winnerId) ? "ready" : "neutral";
  }

  return "neutral";
}

/**
 * These are response-queue filters, not historical decision counts.
 * Withdrawn/unknown selections cannot appear in the current accepted or
 * declined queues just because a previous decision is still in the read model.
 */
export function hasCurrentOrganizerResponseReviewDecision(
  response: OrganizerResponseReviewEvidence,
  method: "internal" | "national_final",
  decision: "accepted" | "declined",
): boolean {
  if (!response.participating || response.selection_method !== method) return false;
  if (method === "internal") {
    const entry = response.internal_entries;
    return !response.entry_unknown && Boolean(entry?.song_title) &&
      Boolean(entry && classifyOrganizerEntryReview(entry) === decision);
  }
  if (response.nf_entries_unknown) return false;
  return (response.national_finals?.national_final_entries ?? [])
    .some((entry) => !entry.removed && classifyOrganizerEntryReview(entry) === decision);
}

/**
 * Display-only National Final summary. Never imply a stored winner is valid
 * when the referenced candidate is removed/unknown, or when accepted review
 * evidence belongs to an earlier immutable version.
 */
export function describeOrganizerNationalFinalQueue(
  response: OrganizerResponseReviewEvidence,
): string | null {
  if (!response.participating || response.selection_method !== "national_final") return null;
  if (response.nf_entries_unknown) return "National Final entries are not confirmed yet";
  const entries = (response.national_finals?.national_final_entries ?? [])
    .filter((entry) => !entry.removed && entry.review_status !== "removed");
  if (!entries.length) return "No active National Final candidates";
  const winner = response.national_finals?.winning_entry_id;
  if (winner && !entries.some((entry) => entry.id === winner)) {
    return "Stored National Final winner is no longer an active candidate";
  }
  const reviewStates = entries.map(classifyOrganizerEntryReview);
  if (reviewStates.includes("declined")) {
    return "National Final entries require corrections";
  }
  if (reviewStates.some((state) => state !== "accepted")) {
    return winner
      ? "Winner recorded · current Entry reviews still incomplete"
      : "National Final entries still need review";
  }
  return winner
    ? "Winner selected · all active Entries accepted on current versions"
    : "All active Entries accepted · waiting for National Final winner";
}
