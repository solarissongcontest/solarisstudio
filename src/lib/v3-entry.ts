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
  confirmation: {
    submissionId: string;
    selectionMethod: string | null;
    canEdit: boolean;
    editReason: string | null;
    internalEntry: V3EntryCandidate | null;
    nationalFinal: {
      id: string;
      name: string | null;
      winnerEntryId: string | null;
      entries: readonly V3EntryCandidate[];
    } | null;
  } | null;
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
