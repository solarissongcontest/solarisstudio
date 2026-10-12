import {
  createV3SubmittedEntryVersion,
  evaluateV3EntryReview,
  type V3EntryReview,
  type V3EntryReviewState,
  type V3EntryScope,
  type V3SubmittedEntryVersion,
} from "./v3-entry-version-binding";

export type V3EntryVersionLedgerSource =
  | "participant_submit"
  | "organizer_restore";

export type V3EntryVersionLedgerRecord = {
  version: V3SubmittedEntryVersion;
  source: V3EntryVersionLedgerSource;
  parentVersionId: string | null;
  restoredFromVersionId: string | null;
};

export type V3EntryReviewLedgerRecord = {
  review: V3EntryReview;
  reviewRevision: number;
};

export type V3EntryVersionLedger = V3EntryScope & {
  versions: readonly V3EntryVersionLedgerRecord[];
  reviews: readonly V3EntryReviewLedgerRecord[];
  currentVersionId: string | null;
};

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function validTimestamp(value: string, label: string) {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${label} must be a valid server timestamp`);
  }
  return normalized;
}

function sameScope(left: V3EntryScope, right: V3EntryScope) {
  return (
    left.entryId === right.entryId &&
    left.editionId === right.editionId &&
    left.delegationId === right.delegationId
  );
}

function assertSameScope(
  ledger: V3EntryVersionLedger,
  value: V3EntryScope,
  label: string,
) {
  if (!sameScope(ledger, value)) {
    throw new Error(`${label} scope does not match the Entry ledger`);
  }
}

function sameVersionRecord(
  left: V3EntryVersionLedgerRecord,
  right: V3EntryVersionLedgerRecord,
) {
  const a = left.version;
  const b = right.version;
  return (
    a.entryId === b.entryId &&
    a.editionId === b.editionId &&
    a.delegationId === b.delegationId &&
    a.versionId === b.versionId &&
    a.versionNumber === b.versionNumber &&
    a.contentHash === b.contentHash &&
    a.submittedAt === b.submittedAt &&
    a.submittedBy === b.submittedBy &&
    left.source === right.source &&
    left.parentVersionId === right.parentVersionId &&
    left.restoredFromVersionId === right.restoredFromVersionId
  );
}

function sameReviewRecord(
  left: V3EntryReviewLedgerRecord,
  right: V3EntryReviewLedgerRecord,
) {
  const a = left.review;
  const b = right.review;
  return (
    left.reviewRevision === right.reviewRevision &&
    a.entryId === b.entryId &&
    a.editionId === b.editionId &&
    a.delegationId === b.delegationId &&
    a.reviewId === b.reviewId &&
    a.submittedVersionId === b.submittedVersionId &&
    a.submittedVersionNumber === b.submittedVersionNumber &&
    a.submittedContentHash === b.submittedContentHash &&
    a.decision === b.decision &&
    a.reviewedAt === b.reviewedAt &&
    a.reviewedBy === b.reviewedBy &&
    a.reason === b.reason
  );
}

export function createV3EntryVersionLedger(
  scope: V3EntryScope,
): V3EntryVersionLedger {
  return {
    entryId: required(scope.entryId, "entryId"),
    editionId: required(scope.editionId, "editionId"),
    delegationId: required(scope.delegationId, "delegationId"),
    versions: [],
    reviews: [],
    currentVersionId: null,
  };
}

/**
 * Appends one already-persisted immutable submitted version to canonical Entry
 * history. The binding contract from v3-entry-version-binding owns immutable
 * version identity; this ledger owns sequence, parentage, restore provenance and
 * replay conflict detection.
 */
export function appendV3EntryVersionLedgerRecord(
  ledger: V3EntryVersionLedger,
  record: V3EntryVersionLedgerRecord,
): V3EntryVersionLedger {
  const version = createV3SubmittedEntryVersion(record.version);
  const normalized: V3EntryVersionLedgerRecord = {
    version,
    source: record.source,
    parentVersionId: record.parentVersionId,
    restoredFromVersionId: record.restoredFromVersionId,
  };

  assertSameScope(ledger, version, "submitted version");

  const existing = ledger.versions.find(
    (candidate) => candidate.version.versionId === version.versionId,
  );
  if (existing) {
    if (!sameVersionRecord(existing, normalized)) {
      throw new Error(
        "versionId replay conflicts with persisted immutable Entry history",
      );
    }
    return ledger;
  }

  const expectedVersionNumber = ledger.versions.length + 1;
  if (version.versionNumber !== expectedVersionNumber) {
    throw new Error(
      `versionNumber must be the next contiguous Entry version (${expectedVersionNumber})`,
    );
  }

  if (ledger.versions.length === 0) {
    if (record.parentVersionId !== null) {
      throw new Error("the first immutable Entry version cannot have a parent");
    }
  } else if (record.parentVersionId !== ledger.currentVersionId) {
    throw new Error("new Entry version must descend from the current version");
  }

  if (record.source === "participant_submit") {
    if (record.restoredFromVersionId !== null) {
      throw new Error(
        "participant submission cannot claim historical restore provenance",
      );
    }
  } else {
    const restoredFrom = ledger.versions.find(
      (candidate) =>
        candidate.version.versionId === record.restoredFromVersionId,
    );
    if (!restoredFrom) {
      throw new Error(
        "restored Entry version must reference existing immutable history",
      );
    }
    if (restoredFrom.version.contentHash !== version.contentHash) {
      throw new Error(
        "restored Entry version content hash must match its historical source",
      );
    }
  }

  return {
    ...ledger,
    versions: [...ledger.versions, normalized],
    currentVersionId: version.versionId,
  };
}

export function currentV3EntryLedgerVersion(
  ledger: V3EntryVersionLedger,
): V3SubmittedEntryVersion | null {
  if (!ledger.currentVersionId) return null;
  return (
    ledger.versions.find(
      (record) => record.version.versionId === ledger.currentVersionId,
    )?.version ?? null
  );
}

/**
 * Persists review chronology only for the exact current version. The binding
 * module can describe a superseded review for read compatibility; this ledger
 * deliberately refuses to append a newly-issued stale review command.
 */
export function appendV3EntryReviewLedgerRecord(
  ledger: V3EntryVersionLedger,
  record: V3EntryReviewLedgerRecord,
): V3EntryVersionLedger {
  const review = record.review;
  assertSameScope(ledger, review, "review");
  required(review.reviewId, "reviewId");
  required(review.reviewedBy, "reviewedBy");
  validTimestamp(review.reviewedAt, "reviewedAt");
  positiveInteger(record.reviewRevision, "reviewRevision");

  const reason = review.reason?.trim() || null;
  if (review.decision !== "approved" && !reason) {
    throw new Error(`${review.decision} review requires a reason`);
  }

  const normalized: V3EntryReviewLedgerRecord = {
    review: { ...review, reason },
    reviewRevision: record.reviewRevision,
  };

  const existing = ledger.reviews.find(
    (candidate) => candidate.review.reviewId === review.reviewId,
  );
  if (existing) {
    if (!sameReviewRecord(existing, normalized)) {
      throw new Error("reviewId replay conflicts with persisted Entry review history");
    }
    return ledger;
  }

  const currentVersion = currentV3EntryLedgerVersion(ledger);
  if (!currentVersion) {
    throw new Error("cannot persist an Entry review before a submitted version");
  }

  const state = evaluateV3EntryReview(currentVersion, normalized.review);
  if (state.state === "integrity_error") {
    throw new Error(`Entry review integrity error: ${state.reason}`);
  }
  if (state.state === "review_superseded") {
    throw new Error("cannot persist a stale Entry review after a newer version exists");
  }

  const reviewsForCurrentVersion = ledger.reviews.filter(
    (candidate) =>
      candidate.review.submittedVersionId === currentVersion.versionId,
  );
  const expectedRevision = reviewsForCurrentVersion.length + 1;
  if (record.reviewRevision !== expectedRevision) {
    throw new Error(
      `reviewRevision must be the next contiguous revision (${expectedRevision})`,
    );
  }

  return {
    ...ledger,
    reviews: [...ledger.reviews, normalized],
  };
}

export function currentV3EntryLedgerReview(
  ledger: V3EntryVersionLedger,
): V3EntryReview | null {
  const version = currentV3EntryLedgerVersion(ledger);
  if (!version) return null;
  const reviews = ledger.reviews.filter(
    (record) => record.review.submittedVersionId === version.versionId,
  );
  return reviews.length > 0 ? reviews[reviews.length - 1]!.review : null;
}

export function currentV3EntryLedgerReviewState(
  ledger: V3EntryVersionLedger,
): V3EntryReviewState {
  return evaluateV3EntryReview(
    currentV3EntryLedgerVersion(ledger),
    currentV3EntryLedgerReview(ledger),
  );
}

export function isCurrentV3EntryLedgerVersionApproved(
  ledger: V3EntryVersionLedger,
) {
  return currentV3EntryLedgerReviewState(ledger).state === "approved_current";
}
