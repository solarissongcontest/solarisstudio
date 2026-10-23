import type { V3EntryCandidate } from "@/lib/v3-entry";

export type V3EntryReviewPresentationTone = "accepted" | "attention" | "danger";

export type V3EntryReviewPresentation = {
  label: string;
  tone: V3EntryReviewPresentationTone;
};

/**
 * Candidate cards are presentation-only, but they still must respect the same
 * immutable-version boundary as the canonical Entry lifecycle. Review evidence
 * for an older Entry version must never be presented as a current correction
 * requirement or current acceptance.
 */
export function deriveV3EntryCandidateReviewPresentation(
  candidate: V3EntryCandidate,
): V3EntryReviewPresentation {
  if (candidate.removed || candidate.reviewStatus === "removed") {
    return { label: "Removed by organizer", tone: "danger" };
  }

  if (candidate.reviewStatus === "accepted" && candidate.reviewMatchesCurrentVersion) {
    return { label: "Current version accepted", tone: "accepted" };
  }

  if (candidate.reviewStatus === "accepted") {
    return {
      label: "Older version accepted · review current version",
      tone: "attention",
    };
  }

  if (candidate.reviewStatus === "declined" && candidate.reviewMatchesCurrentVersion) {
    return { label: "Changes required", tone: "danger" };
  }

  if (candidate.reviewStatus === "declined") {
    return candidate.currentVersionId
      ? {
          label: "Previous version declined · review current version",
          tone: "attention",
        }
      : { label: "Legacy decline evidence", tone: "attention" };
  }

  if (candidate.currentVersionId) {
    return { label: "Waiting for organizer review", tone: "attention" };
  }

  return { label: "Legacy review evidence", tone: "attention" };
}
