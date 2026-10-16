import { describe, expect, it } from "vitest";

import {
  deriveV3EntryLifecycle,
  type V3EntryCandidate,
  type V3EntryConfirmationProjection,
} from "./v3-entry";

function candidate(
  overrides: Partial<V3EntryCandidate> = {},
): V3EntryCandidate {
  return {
    id: "entry-1",
    artist: "Artist",
    songTitle: "Song",
    reviewStatus: "pending",
    reviewReason: null,
    contentRevision: 1,
    currentVersionId: "version-1",
    reviewedVersionId: null,
    reviewMatchesCurrentVersion: false,
    removed: false,
    ...overrides,
  };
}

function confirmation(
  overrides: Partial<V3EntryConfirmationProjection> = {},
): V3EntryConfirmationProjection {
  return {
    submissionId: "submission-1",
    roundId: "round-1",
    roundName: "Confirmation",
    submittedAt: "2026-10-16T05:00:00.000Z",
    updatedAt: "2026-10-16T05:00:00.000Z",
    selectionMethod: "internal",
    canEdit: true,
    editReason: null,
    receipt: null,
    internalEntry: candidate(),
    nationalFinal: null,
    ...overrides,
  };
}

describe("V3 Entry review lifecycle", () => {
  it("keeps a missing canonical submission distinct from draft/autosave state", () => {
    expect(deriveV3EntryLifecycle(null)).toEqual({
      state: "not-submitted",
      issue: null,
      affectedCandidateIds: [],
    });
  });

  it("treats a canonical submission without candidate review evidence as awaiting review", () => {
    expect(
      deriveV3EntryLifecycle(
        confirmation({ internalEntry: null, nationalFinal: null }),
      ).state,
    ).toBe("awaiting-review");
  });

  it("surfaces an exact decline reason only when it applies to the current version", () => {
    const lifecycle = deriveV3EntryLifecycle(
      confirmation({
        internalEntry: candidate({
          reviewStatus: "declined",
          reviewReason: "Replace the artwork credit before resubmitting.",
          reviewedVersionId: "version-1",
          reviewMatchesCurrentVersion: true,
        }),
      }),
    );

    expect(lifecycle).toEqual({
      state: "changes-required",
      issue: "Replace the artwork credit before resubmitting.",
      affectedCandidateIds: ["entry-1"],
    });
  });

  it("accepts only review evidence bound to the current immutable version", () => {
    expect(
      deriveV3EntryLifecycle(
        confirmation({
          internalEntry: candidate({
            reviewStatus: "accepted",
            reviewedVersionId: "version-1",
            reviewMatchesCurrentVersion: true,
          }),
        }),
      ).state,
    ).toBe("accepted");
  });

  it("does not reuse an acceptance after the content version changes", () => {
    const lifecycle = deriveV3EntryLifecycle(
      confirmation({
        internalEntry: candidate({
          reviewStatus: "accepted",
          currentVersionId: "version-2",
          reviewedVersionId: "version-1",
          reviewMatchesCurrentVersion: false,
        }),
      }),
    );

    expect(lifecycle.state).toBe("review-stale");
    expect(lifecycle.affectedCandidateIds).toEqual(["entry-1"]);
  });

  it("keeps pending current-version review in awaiting-review", () => {
    expect(
      deriveV3EntryLifecycle(
        confirmation({ internalEntry: candidate({ reviewStatus: "pending" }) }),
      ).state,
    ).toBe("awaiting-review");
  });

  it("prioritizes removed evidence over accepted or pending labels", () => {
    const lifecycle = deriveV3EntryLifecycle(
      confirmation({
        internalEntry: candidate({
          reviewStatus: "removed",
          reviewReason: "Entry withdrawn from the submitted candidate set.",
          removed: true,
        }),
      }),
    );

    expect(lifecycle.state).toBe("removed");
    expect(lifecycle.issue).toBe("Entry withdrawn from the submitted candidate set.");
  });

  it("requires every national-final candidate to have a current acceptance", () => {
    const first = candidate({
      id: "entry-1",
      reviewStatus: "accepted",
      reviewedVersionId: "version-1",
      reviewMatchesCurrentVersion: true,
    });
    const second = candidate({
      id: "entry-2",
      currentVersionId: "version-2",
      reviewedVersionId: "version-2",
      reviewStatus: "accepted",
      reviewMatchesCurrentVersion: true,
    });

    const accepted = deriveV3EntryLifecycle(
      confirmation({
        selectionMethod: "national_final",
        internalEntry: null,
        nationalFinal: {
          id: "nf-1",
          name: "Final",
          winnerEntryId: "entry-1",
          entries: [first, second],
        },
      }),
    );
    expect(accepted.state).toBe("accepted");

    const correction = deriveV3EntryLifecycle(
      confirmation({
        selectionMethod: "national_final",
        internalEntry: null,
        nationalFinal: {
          id: "nf-1",
          name: "Final",
          winnerEntryId: "entry-1",
          entries: [
            first,
            {
              ...second,
              reviewStatus: "declined",
              reviewReason: "Correct candidate metadata.",
              reviewMatchesCurrentVersion: true,
            },
          ],
        },
      }),
    );

    expect(correction.state).toBe("changes-required");
    expect(correction.issue).toBe("Correct candidate metadata.");
    expect(correction.affectedCandidateIds).toEqual(["entry-2"]);
  });
});
