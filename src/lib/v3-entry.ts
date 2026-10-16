export type V3EntryReviewStatus = "pending" | "accepted" | "declined" | "removed" | "unknown";

export type V3EntryCandidate = {
  id: string;
  artist: string | null;
  songTitle: string | null;
  reviewStatus: V3EntryReviewStatus;
  reviewReason: string | null;
  contentRevision: number | null;
  currentVersionId: string | null;
  reviewedVersionId: string | null;
  reviewMatchesCurrentVersion: boolean;
  removed: boolean;
};

export type V3EntryVersionEvidence = {
  id: string;
  revision: number;
  parentVersionId: string | null;
  source: "legacy_observation" | "canonical_write" | "organizer_restore" | string;
  restoredFromSubmissionVersionId: string | null;
  artist: string | null;
  songTitle: string | null;
  recordedAt: string | null;
  reviews: readonly {
    decision: string;
    reason: string | null;
    reviewedAt: string | null;
  }[];
};

export type V3EntryReadinessCheck = {
  id: string;
  label: string;
  level: "pass" | "warning" | "blocked" | string;
  message: string;
};

export type V3EntrySubmissionReceipt = {
  authority: "authoritative_server";
  receiptId: string;
  roundId: string;
  acceptedAt: string;
};

export type V3EntryConfirmationProjection = {
  submissionId: string;
  roundId: string | null;
  roundName: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
  selectionMethod: string | null;
  canEdit: boolean;
  editReason: string | null;
  receipt: V3EntrySubmissionReceipt | null;
  internalEntry: V3EntryCandidate | null;
  nationalFinal: {
    id: string;
    name: string | null;
    winnerEntryId: string | null;
    entries: readonly V3EntryCandidate[];
  } | null;
};

export type V3EntryLifecycleState =
  | "not-submitted"
  | "awaiting-review"
  | "changes-required"
  | "accepted"
  | "review-stale"
  | "removed";

export type V3EntryLifecycle = {
  state: V3EntryLifecycleState;
  issue: string | null;
  affectedCandidateIds: readonly string[];
};

export type V3EntryProjection = {
  state: "ready" | "no-delegation" | "no-edition";
  edition: {
    id: string;
    label: string;
  } | null;
  delegation: {
    id: string;
    name: string;
    code: string;
  } | null;
  confirmation: V3EntryConfirmationProjection | null;
  /** Optional server-resolved lifecycle. Older read-model revisions omit it. */
  lifecycle?: V3EntryLifecycle | null;
  readiness: {
    score: number | null;
    state: string | null;
    eligibilityStatus: string | null;
    checks: readonly V3EntryReadinessCheck[];
    actions: readonly {
      id: string;
      label: string;
      description: string;
      priority: string;
      href: string;
    }[];
  };
  versionHistory: readonly V3EntryVersionEvidence[];
};

export function reviewMatchesCurrentVersion(input: {
  currentVersionId: string | null;
  reviewedVersionId: string | null;
  reviewStatus: V3EntryReviewStatus;
}) {
  return (
    input.reviewStatus !== "pending" &&
    input.reviewStatus !== "unknown" &&
    Boolean(input.currentVersionId) &&
    input.reviewedVersionId === input.currentVersionId
  );
}

function lifecycleCandidates(
  confirmation: V3EntryConfirmationProjection,
): readonly V3EntryCandidate[] {
  if (confirmation.internalEntry) return [confirmation.internalEntry];
  return confirmation.nationalFinal?.entries ?? [];
}

/**
 * Derive participant-facing Entry review state exclusively from canonical
 * server evidence. Browser time, local drafts and optimistic labels are never
 * allowed to turn an Entry into submitted/accepted truth.
 */
export function deriveV3EntryLifecycle(
  confirmation: V3EntryConfirmationProjection | null,
): V3EntryLifecycle {
  if (!confirmation) {
    return { state: "not-submitted", issue: null, affectedCandidateIds: [] };
  }

  const candidates = lifecycleCandidates(confirmation);
  if (!candidates.length) {
    return { state: "awaiting-review", issue: null, affectedCandidateIds: [] };
  }

  const removed = candidates.filter(
    (candidate) => candidate.removed || candidate.reviewStatus === "removed",
  );
  if (removed.length) {
    return {
      state: "removed",
      issue: removed.find((candidate) => candidate.reviewReason)?.reviewReason ?? null,
      affectedCandidateIds: removed.map((candidate) => candidate.id),
    };
  }

  const declinedCurrent = candidates.filter(
    (candidate) =>
      candidate.reviewStatus === "declined" && candidate.reviewMatchesCurrentVersion,
  );
  if (declinedCurrent.length) {
    return {
      state: "changes-required",
      issue:
        declinedCurrent.find((candidate) => candidate.reviewReason)?.reviewReason ??
        "The organizer requested changes to the current submission version.",
      affectedCandidateIds: declinedCurrent.map((candidate) => candidate.id),
    };
  }

  const staleReviews = candidates.filter(
    (candidate) =>
      Boolean(candidate.currentVersionId) &&
      candidate.reviewStatus !== "pending" &&
      candidate.reviewStatus !== "unknown" &&
      !candidate.reviewMatchesCurrentVersion,
  );
  if (staleReviews.length) {
    return {
      state: "review-stale",
      issue: null,
      affectedCandidateIds: staleReviews.map((candidate) => candidate.id),
    };
  }

  const acceptedCurrent = candidates.filter(
    (candidate) =>
      candidate.reviewStatus === "accepted" && candidate.reviewMatchesCurrentVersion,
  );
  if (acceptedCurrent.length === candidates.length) {
    return {
      state: "accepted",
      issue: null,
      affectedCandidateIds: acceptedCurrent.map((candidate) => candidate.id),
    };
  }

  return {
    state: "awaiting-review",
    issue: null,
    affectedCandidateIds: candidates
      .filter((candidate) => candidate.reviewStatus === "pending" || candidate.reviewStatus === "unknown")
      .map((candidate) => candidate.id),
  };
}
