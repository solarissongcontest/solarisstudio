/**
 * Operator-confirmed intent for a reviewed Entry. This never grants review
 * authority: the existing server-side preview, CAS and operation receipt still
 * decide whether the canonical mutation can proceed.
 */
export type OrganizerEntryDecisionStatus = "accepted" | "declined" | "pending" | "removed";

export type OrganizerEntryDecisionScope = {
  entryId: string;
  submissionId: string;
  editionId: string;
  currentVersionId: string | null;
};

export type OrganizerEntryDecisionIntent = OrganizerEntryDecisionScope & {
  status: OrganizerEntryDecisionStatus;
  reason: string;
};

export function prepareOrganizerEntryReviewDecision(
  scope: OrganizerEntryDecisionScope,
  status: OrganizerEntryDecisionStatus,
  reason: string,
): OrganizerEntryDecisionIntent {
  if (!scope.entryId || !scope.submissionId || !scope.editionId) {
    throw new Error("A current Entry, submission and Organizer edition are required for review.");
  }
  const auditReason = reason.trim();
  if (status !== "accepted" && !auditReason) {
    throw new Error("A reviewed reason is required for this Entry decision.");
  }
  return { ...scope, status, reason: auditReason };
}

export function isOrganizerEntryReviewDecisionCurrent(
  reviewed: OrganizerEntryDecisionIntent,
  currentScope: OrganizerEntryDecisionScope,
  reason: string,
): boolean {
  return reviewed.entryId === currentScope.entryId &&
    reviewed.submissionId === currentScope.submissionId &&
    reviewed.editionId === currentScope.editionId &&
    reviewed.currentVersionId === currentScope.currentVersionId &&
    reviewed.reason === reason.trim();
}
