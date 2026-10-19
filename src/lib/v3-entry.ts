import type { EntryCredit } from "./ssc";

export type V3EntryReviewStatus = "pending" | "accepted" | "declined" | "removed" | "unknown";

export const V3_ENTRY_EDITOR_SECTIONS = [
  "song",
  "artist",
  "credits",
  "metadata",
  "media",
  "review",
] as const;

export type V3EntryEditorSection = (typeof V3_ENTRY_EDITOR_SECTIONS)[number];

export type V3EntryCandidate = {
  id: string;
  artist: string | null;
  songTitle: string | null;
  credits?: readonly EntryCredit[];
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
  credits: readonly EntryCredit[];
  recordedAt: string | null;
  reviews: readonly {
    decision: string;
    reason: string | null;
    reviewedAt: string | null;
  }[];
};

export type V3EntryRevisionFieldDiff = {
  field: "artist" | "songTitle" | "credits";
  label: string;
  previousValue: string | null;
  currentValue: string | null;
  changed: boolean;
};

export type V3EntryResubmissionDiff = {
  previousRevision: number;
  currentRevision: number;
  fields: readonly V3EntryRevisionFieldDiff[];
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

/**
 * Best-effort presentation hint only. The organizer review reason remains the
 * canonical issue text; this helper never creates workflow truth or changes
 * authorization. It intentionally returns null when the reason is ambiguous.
 */
export function inferV3EntryCorrectionSection(issue: string | null): V3EntryEditorSection | null {
  if (!issue) return null;
  const value = issue.toLowerCase();

  if (/\b(image|photo|artwork|audio|video|media|clip|file|upload)\b/.test(value)) return "media";
  if (/\b(artist|performer)\b/.test(value)) return "artist";
  if (/\b(credit|composer|lyric|writer|producer)\b/.test(value)) return "credits";
  if (/\b(song|title|track)\b/.test(value)) return "song";
  if (/\b(metadata|language|label|release|genre)\b/.test(value)) return "metadata";
  if (/\b(review|eligib|rule|requirement)\b/.test(value)) return "review";
  return null;
}

function formatCredits(credits: readonly EntryCredit[]) {
  if (!credits.length) return null;
  return credits
    .map((credit) => `${credit.role.replace(/_/g, " ")}: ${credit.name}`)
    .join(" · ");
}

function creditsMatch(left: readonly EntryCredit[], right: readonly EntryCredit[]) {
  if (left.length !== right.length) return false;
  return left.every(
    (credit, index) =>
      credit.role === right[index]?.role && credit.name === right[index]?.name,
  );
}

/**
 * Compare the newest immutable Entry version with its previous revision. The
 * projection now includes canonical structured Credits, so the participant can
 * see a truthful Credits-only correction/resubmission without reconstructing
 * state from local drafts or the browser.
 */
export function deriveV3EntryResubmissionDiff(
  history: readonly V3EntryVersionEvidence[],
): V3EntryResubmissionDiff | null {
  if (history.length < 2) return null;
  const ordered = [...history].sort((left, right) => right.revision - left.revision);
  const current = ordered[0];
  const previous = ordered.find((version) => version.revision < current.revision);
  if (!previous) return null;

  const fields: V3EntryRevisionFieldDiff[] = [
    {
      field: "artist",
      label: "Artist",
      previousValue: previous.artist,
      currentValue: current.artist,
      changed: previous.artist !== current.artist,
    },
    {
      field: "songTitle",
      label: "Song",
      previousValue: previous.songTitle,
      currentValue: current.songTitle,
      changed: previous.songTitle !== current.songTitle,
    },
    {
      field: "credits",
      label: "Credits",
      previousValue: formatCredits(previous.credits),
      currentValue: formatCredits(current.credits),
      changed: !creditsMatch(previous.credits, current.credits),
    },
  ];

  return {
    previousRevision: previous.revision,
    currentRevision: current.revision,
    fields,
  };
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