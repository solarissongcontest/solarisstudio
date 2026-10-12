export type V3EntryScope = {
  entryId: string;
  editionId: string;
  delegationId: string;
};

export type V3SubmittedEntryVersion = V3EntryScope & {
  versionId: string;
  versionNumber: number;
  contentHash: string;
  submittedAt: string;
  submittedBy: string;
};

export type V3EntryReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export type V3EntryReview = V3EntryScope & {
  reviewId: string;
  submittedVersionId: string;
  submittedVersionNumber: number;
  submittedContentHash: string;
  decision: V3EntryReviewDecision;
  reviewedAt: string;
  reviewedBy: string;
  reason: string | null;
};

export type V3EntryReviewState =
  | { state: 'no_submission' }
  | { state: 'awaiting_review'; version: V3SubmittedEntryVersion }
  | { state: 'approved_current'; version: V3SubmittedEntryVersion; review: V3EntryReview }
  | { state: 'changes_requested_current'; version: V3SubmittedEntryVersion; review: V3EntryReview }
  | { state: 'rejected_current'; version: V3SubmittedEntryVersion; review: V3EntryReview }
  | {
      state: 'review_superseded';
      version: V3SubmittedEntryVersion;
      review: V3EntryReview;
      reviewedVersionId: string;
    }
  | { state: 'integrity_error'; reason: string };

export type V3LegacyEntrySnapshot = V3EntryScope & {
  updatedAt: string;
  status: string | null;
};

export type V3LegacyEntryEvidence = {
  authority: 'legacy_unversioned';
  entryId: string;
  editionId: string;
  delegationId: string;
  observedUpdatedAt: string;
  legacyStatus: string | null;
  canBindV3Review: false;
  canSatisfyImmutableVersionGate: false;
};

function assertNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be non-empty`);
  return normalized;
}

function assertPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertTimestamp(value: string, label: string): string {
  const normalized = assertNonEmpty(value, label);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return normalized;
}

function normalizeScope(scope: V3EntryScope): V3EntryScope {
  return {
    entryId: assertNonEmpty(scope.entryId, 'entryId'),
    editionId: assertNonEmpty(scope.editionId, 'editionId'),
    delegationId: assertNonEmpty(scope.delegationId, 'delegationId'),
  };
}

function sameScope(left: V3EntryScope, right: V3EntryScope): boolean {
  return (
    left.entryId === right.entryId &&
    left.editionId === right.editionId &&
    left.delegationId === right.delegationId
  );
}

export function createV3SubmittedEntryVersion(
  input: V3SubmittedEntryVersion,
): V3SubmittedEntryVersion {
  const scope = normalizeScope(input);
  return Object.freeze({
    ...scope,
    versionId: assertNonEmpty(input.versionId, 'versionId'),
    versionNumber: assertPositiveInteger(input.versionNumber, 'versionNumber'),
    contentHash: assertNonEmpty(input.contentHash, 'contentHash'),
    submittedAt: assertTimestamp(input.submittedAt, 'submittedAt'),
    submittedBy: assertNonEmpty(input.submittedBy, 'submittedBy'),
  });
}

export function createV3EntryReview(
  version: V3SubmittedEntryVersion,
  input: {
    reviewId: string;
    decision: V3EntryReviewDecision;
    reviewedAt: string;
    reviewedBy: string;
    reason?: string | null;
  },
): V3EntryReview {
  const canonical = createV3SubmittedEntryVersion(version);
  return Object.freeze({
    entryId: canonical.entryId,
    editionId: canonical.editionId,
    delegationId: canonical.delegationId,
    reviewId: assertNonEmpty(input.reviewId, 'reviewId'),
    submittedVersionId: canonical.versionId,
    submittedVersionNumber: canonical.versionNumber,
    submittedContentHash: canonical.contentHash,
    decision: input.decision,
    reviewedAt: assertTimestamp(input.reviewedAt, 'reviewedAt'),
    reviewedBy: assertNonEmpty(input.reviewedBy, 'reviewedBy'),
    reason: input.reason?.trim() || null,
  });
}

export function evaluateV3EntryReview(
  currentVersion: V3SubmittedEntryVersion | null,
  latestReview: V3EntryReview | null,
): V3EntryReviewState {
  if (!currentVersion) return { state: 'no_submission' };

  const version = createV3SubmittedEntryVersion(currentVersion);
  if (!latestReview) return { state: 'awaiting_review', version };

  if (!sameScope(version, latestReview)) {
    return { state: 'integrity_error', reason: 'Review scope does not match the entry version.' };
  }

  if (
    latestReview.submittedVersionNumber <= 0 ||
    !Number.isSafeInteger(latestReview.submittedVersionNumber) ||
    !latestReview.submittedVersionId.trim() ||
    !latestReview.submittedContentHash.trim()
  ) {
    return { state: 'integrity_error', reason: 'Review does not contain a valid immutable version binding.' };
  }

  const exactVersion =
    latestReview.submittedVersionId === version.versionId &&
    latestReview.submittedVersionNumber === version.versionNumber &&
    latestReview.submittedContentHash === version.contentHash;

  if (!exactVersion) {
    return {
      state: 'review_superseded',
      version,
      review: latestReview,
      reviewedVersionId: latestReview.submittedVersionId,
    };
  }

  if (latestReview.decision === 'approved') {
    return { state: 'approved_current', version, review: latestReview };
  }
  if (latestReview.decision === 'changes_requested') {
    return { state: 'changes_requested_current', version, review: latestReview };
  }
  return { state: 'rejected_current', version, review: latestReview };
}

export function canPublishV3EntryVersion(
  version: V3SubmittedEntryVersion,
  review: V3EntryReview | null,
): boolean {
  return evaluateV3EntryReview(version, review).state === 'approved_current';
}

export function restoreV3SubmittedEntryVersion(
  sourceVersion: V3SubmittedEntryVersion,
  input: {
    newVersionId: string;
    newVersionNumber: number;
    restoredAt: string;
    restoredBy: string;
  },
): V3SubmittedEntryVersion {
  const source = createV3SubmittedEntryVersion(sourceVersion);
  const nextNumber = assertPositiveInteger(input.newVersionNumber, 'newVersionNumber');
  const newVersionId = assertNonEmpty(input.newVersionId, 'newVersionId');

  if (nextNumber <= source.versionNumber) {
    throw new Error('Restored entry version must advance the version number.');
  }
  if (newVersionId === source.versionId) {
    throw new Error('Restoring an entry must create a new immutable version identity.');
  }

  return createV3SubmittedEntryVersion({
    entryId: source.entryId,
    editionId: source.editionId,
    delegationId: source.delegationId,
    versionId: newVersionId,
    versionNumber: nextNumber,
    contentHash: source.contentHash,
    submittedAt: assertTimestamp(input.restoredAt, 'restoredAt'),
    submittedBy: assertNonEmpty(input.restoredBy, 'restoredBy'),
  });
}

export function adaptLegacyEntrySnapshot(
  snapshot: V3LegacyEntrySnapshot,
): V3LegacyEntryEvidence {
  const scope = normalizeScope(snapshot);
  return Object.freeze({
    authority: 'legacy_unversioned',
    ...scope,
    observedUpdatedAt: assertTimestamp(snapshot.updatedAt, 'updatedAt'),
    legacyStatus: snapshot.status?.trim() || null,
    canBindV3Review: false,
    canSatisfyImmutableVersionGate: false,
  });
}
