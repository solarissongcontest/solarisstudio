import { describe, expect, it } from "vitest";

import {
  createV3EntryReview,
  createV3SubmittedEntryVersion,
  restoreV3SubmittedEntryVersion,
  type V3EntryReview,
  type V3SubmittedEntryVersion,
} from "./v3-entry-version-binding";
import {
  appendV3EntryReviewLedgerRecord,
  appendV3EntryVersionLedgerRecord,
  createV3EntryVersionLedger,
  currentV3EntryLedgerReviewState,
  currentV3EntryLedgerVersion,
  isCurrentV3EntryLedgerVersionApproved,
  type V3EntryVersionLedger,
} from "./v3-entry-version-ledger";

const SCOPE = {
  entryId: "entry-oland",
  editionId: "edition-22",
  delegationId: "country-oland",
};

function submittedVersion(
  versionNumber: number,
  overrides: Partial<V3SubmittedEntryVersion> = {},
) {
  return createV3SubmittedEntryVersion({
    ...SCOPE,
    versionId: `entry-version-${versionNumber}`,
    versionNumber,
    contentHash: `sha256:entry-version-${versionNumber}`,
    submittedAt: `2026-10-12T0${versionNumber}:00:00.000Z`,
    submittedBy: "user-hod",
    ...overrides,
  });
}

function emptyLedger() {
  return createV3EntryVersionLedger(SCOPE);
}

function appendV1(ledger = emptyLedger()) {
  return appendV3EntryVersionLedgerRecord(ledger, {
    version: submittedVersion(1),
    source: "participant_submit",
    parentVersionId: null,
    restoredFromVersionId: null,
  });
}

function appendV2(ledger: V3EntryVersionLedger) {
  return appendV3EntryVersionLedgerRecord(ledger, {
    version: submittedVersion(2),
    source: "participant_submit",
    parentVersionId: "entry-version-1",
    restoredFromVersionId: null,
  });
}

function approvedReview(
  version: V3SubmittedEntryVersion,
  overrides: Partial<V3EntryReview> = {},
) {
  return createV3EntryReview(version, {
    reviewId: "review-1",
    decision: "approved",
    reviewedAt: "2026-10-12T03:00:00.000Z",
    reviewedBy: "organizer-1",
    ...overrides,
  });
}

describe("Solaris Studio V3 Entry version ledger", () => {
  it("starts with stable Entry scope and no persisted versions", () => {
    const ledger = emptyLedger();

    expect(ledger).toEqual({
      ...SCOPE,
      versions: [],
      reviews: [],
      currentVersionId: null,
    });
    expect(currentV3EntryLedgerVersion(ledger)).toBeNull();
    expect(currentV3EntryLedgerReviewState(ledger)).toEqual({
      state: "no_submission",
    });
  });

  it("requires contiguous version sequence and exact parent chain", () => {
    const v1 = appendV1();
    const v2 = appendV2(v1);

    expect(v2.currentVersionId).toBe("entry-version-2");
    expect(v2.versions.map((record) => record.version.versionNumber)).toEqual([
      1, 2,
    ]);

    expect(() =>
      appendV3EntryVersionLedgerRecord(v1, {
        version: submittedVersion(3),
        source: "participant_submit",
        parentVersionId: "entry-version-1",
        restoredFromVersionId: null,
      }),
    ).toThrow("versionNumber must be the next contiguous Entry version (2)");

    expect(() =>
      appendV3EntryVersionLedgerRecord(v1, {
        version: submittedVersion(2),
        source: "participant_submit",
        parentVersionId: "some-old-version",
        restoredFromVersionId: null,
      }),
    ).toThrow("new Entry version must descend from the current version");
  });

  it("requires the first immutable version to have no parent", () => {
    expect(() =>
      appendV3EntryVersionLedgerRecord(emptyLedger(), {
        version: submittedVersion(1),
        source: "participant_submit",
        parentVersionId: "impossible-parent",
        restoredFromVersionId: null,
      }),
    ).toThrow("the first immutable Entry version cannot have a parent");
  });

  it("accepts exact version replay but rejects conflicting reuse of the same version id", () => {
    const v1 = appendV1();

    expect(
      appendV3EntryVersionLedgerRecord(v1, {
        version: submittedVersion(1),
        source: "participant_submit",
        parentVersionId: null,
        restoredFromVersionId: null,
      }),
    ).toBe(v1);

    expect(() =>
      appendV3EntryVersionLedgerRecord(v1, {
        version: submittedVersion(1, {
          contentHash: "sha256:conflicting-content",
        }),
        source: "participant_submit",
        parentVersionId: null,
        restoredFromVersionId: null,
      }),
    ).toThrow(
      "versionId replay conflicts with persisted immutable Entry history",
    );
  });

  it("persists an exact current-version approval and projects it through the shared binding contract", () => {
    const v1 = appendV1();
    const review = approvedReview(currentV3EntryLedgerVersion(v1)!);
    const reviewed = appendV3EntryReviewLedgerRecord(v1, {
      review,
      reviewRevision: 1,
    });

    expect(currentV3EntryLedgerReviewState(reviewed).state).toBe(
      "approved_current",
    );
    expect(isCurrentV3EntryLedgerVersionApproved(reviewed)).toBe(true);
  });

  it("does not carry approval forward when a newer version is appended", () => {
    const v1 = appendV1();
    const reviewedV1 = appendV3EntryReviewLedgerRecord(v1, {
      review: approvedReview(currentV3EntryLedgerVersion(v1)!),
      reviewRevision: 1,
    });
    const v2 = appendV2(reviewedV1);

    expect(isCurrentV3EntryLedgerVersionApproved(reviewedV1)).toBe(true);
    expect(currentV3EntryLedgerReviewState(v2).state).toBe("awaiting_review");
    expect(isCurrentV3EntryLedgerVersionApproved(v2)).toBe(false);
  });

  it("still requires a new review when a newer version has identical content", () => {
    const v1 = appendV1();
    const v1Version = currentV3EntryLedgerVersion(v1)!;
    const reviewedV1 = appendV3EntryReviewLedgerRecord(v1, {
      review: approvedReview(v1Version),
      reviewRevision: 1,
    });

    const v2SameContent = appendV3EntryVersionLedgerRecord(reviewedV1, {
      version: submittedVersion(2, { contentHash: v1Version.contentHash }),
      source: "participant_submit",
      parentVersionId: v1Version.versionId,
      restoredFromVersionId: null,
    });

    expect(currentV3EntryLedgerReviewState(v2SameContent).state).toBe(
      "awaiting_review",
    );
    expect(isCurrentV3EntryLedgerVersionApproved(v2SameContent)).toBe(false);
  });

  it("refuses to persist a newly-issued stale review after a newer version exists", () => {
    const v1 = appendV1();
    const staleReview = approvedReview(currentV3EntryLedgerVersion(v1)!, {
      reviewId: "late-review-v1",
    });
    const v2 = appendV2(v1);

    expect(() =>
      appendV3EntryReviewLedgerRecord(v2, {
        review: staleReview,
        reviewRevision: 1,
      }),
    ).toThrow("cannot persist a stale Entry review after a newer version exists");
  });

  it("keeps review revisions contiguous per current submitted version", () => {
    const v1 = appendV1();
    const current = currentV3EntryLedgerVersion(v1)!;
    const changesRequested = createV3EntryReview(current, {
      reviewId: "review-1",
      decision: "changes_requested",
      reviewedAt: "2026-10-12T03:00:00.000Z",
      reviewedBy: "organizer-1",
      reason: "Replace the listening link.",
    });
    const firstReview = appendV3EntryReviewLedgerRecord(v1, {
      review: changesRequested,
      reviewRevision: 1,
    });

    const approved = createV3EntryReview(current, {
      reviewId: "review-2",
      decision: "approved",
      reviewedAt: "2026-10-12T03:05:00.000Z",
      reviewedBy: "organizer-2",
    });
    const secondReview = appendV3EntryReviewLedgerRecord(firstReview, {
      review: approved,
      reviewRevision: 2,
    });

    expect(currentV3EntryLedgerReviewState(secondReview).state).toBe(
      "approved_current",
    );

    expect(() =>
      appendV3EntryReviewLedgerRecord(firstReview, {
        review: createV3EntryReview(current, {
          reviewId: "review-gap",
          decision: "approved",
          reviewedAt: "2026-10-12T03:06:00.000Z",
          reviewedBy: "organizer-3",
        }),
        reviewRevision: 3,
      }),
    ).toThrow("reviewRevision must be the next contiguous revision (2)");
  });

  it("accepts exact review replay but rejects conflicting reuse of review identity", () => {
    const v1 = appendV1();
    const review = approvedReview(currentV3EntryLedgerVersion(v1)!);
    const reviewed = appendV3EntryReviewLedgerRecord(v1, {
      review,
      reviewRevision: 1,
    });

    expect(
      appendV3EntryReviewLedgerRecord(reviewed, {
        review,
        reviewRevision: 1,
      }),
    ).toBe(reviewed);

    expect(() =>
      appendV3EntryReviewLedgerRecord(reviewed, {
        review: { ...review, reviewedBy: "another-organizer" },
        reviewRevision: 1,
      }),
    ).toThrow("reviewId replay conflicts with persisted Entry review history");
  });

  it("requires reasons for changes-requested and rejected review records", () => {
    const v1 = appendV1();
    const current = currentV3EntryLedgerVersion(v1)!;

    for (const decision of ["changes_requested", "rejected"] as const) {
      const review = createV3EntryReview(current, {
        reviewId: `review-${decision}`,
        decision,
        reviewedAt: "2026-10-12T03:00:00.000Z",
        reviewedBy: "organizer-1",
      });
      expect(() =>
        appendV3EntryReviewLedgerRecord(v1, {
          review,
          reviewRevision: 1,
        }),
      ).toThrow(`${decision} review requires a reason`);
    }
  });

  it("restores historical content only as a new sequential version with explicit provenance", () => {
    const v1 = appendV1();
    const source = currentV3EntryLedgerVersion(v1)!;
    const v2 = appendV2(v1);
    const restoredVersion = restoreV3SubmittedEntryVersion(source, {
      newVersionId: "entry-version-3-restored-v1",
      newVersionNumber: 3,
      restoredAt: "2026-10-12T05:00:00.000Z",
      restoredBy: "organizer-1",
    });

    const restored = appendV3EntryVersionLedgerRecord(v2, {
      version: restoredVersion,
      source: "organizer_restore",
      parentVersionId: "entry-version-2",
      restoredFromVersionId: "entry-version-1",
    });

    expect(restored.currentVersionId).toBe("entry-version-3-restored-v1");
    expect(restored.versions[2]).toMatchObject({
      source: "organizer_restore",
      parentVersionId: "entry-version-2",
      restoredFromVersionId: "entry-version-1",
    });
    expect(restored.versions[2]?.version.contentHash).toBe(source.contentHash);
    expect(currentV3EntryLedgerReviewState(restored).state).toBe(
      "awaiting_review",
    );
  });

  it("rejects restore provenance that references missing or different historical content", () => {
    const v1 = appendV1();
    const source = currentV3EntryLedgerVersion(v1)!;
    const v2 = appendV2(v1);

    expect(() =>
      appendV3EntryVersionLedgerRecord(v2, {
        version: restoreV3SubmittedEntryVersion(source, {
          newVersionId: "entry-version-3",
          newVersionNumber: 3,
          restoredAt: "2026-10-12T05:00:00.000Z",
          restoredBy: "organizer-1",
        }),
        source: "organizer_restore",
        parentVersionId: "entry-version-2",
        restoredFromVersionId: "missing-version",
      }),
    ).toThrow(
      "restored Entry version must reference existing immutable history",
    );

    expect(() =>
      appendV3EntryVersionLedgerRecord(v2, {
        version: submittedVersion(3, {
          contentHash: "sha256:different-content",
        }),
        source: "organizer_restore",
        parentVersionId: "entry-version-2",
        restoredFromVersionId: "entry-version-1",
      }),
    ).toThrow(
      "restored Entry version content hash must match its historical source",
    );
  });

  it("prevents participant submissions from claiming restore provenance", () => {
    const v1 = appendV1();

    expect(() =>
      appendV3EntryVersionLedgerRecord(v1, {
        version: submittedVersion(2),
        source: "participant_submit",
        parentVersionId: "entry-version-1",
        restoredFromVersionId: "entry-version-1",
      }),
    ).toThrow(
      "participant submission cannot claim historical restore provenance",
    );
  });

  it("fails closed when submitted or review scope does not match the ledger", () => {
    const v1 = appendV1();

    expect(() =>
      appendV3EntryVersionLedgerRecord(v1, {
        version: submittedVersion(2, { entryId: "another-entry" }),
        source: "participant_submit",
        parentVersionId: "entry-version-1",
        restoredFromVersionId: null,
      }),
    ).toThrow("submitted version scope does not match the Entry ledger");

    const review = approvedReview(currentV3EntryLedgerVersion(v1)!);
    expect(() =>
      appendV3EntryReviewLedgerRecord(v1, {
        review: { ...review, delegationId: "another-delegation" },
        reviewRevision: 1,
      }),
    ).toThrow("review scope does not match the Entry ledger");
  });
});
