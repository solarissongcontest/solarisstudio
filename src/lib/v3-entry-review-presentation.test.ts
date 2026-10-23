import { describe, expect, it } from "vitest";

import type { V3EntryCandidate } from "@/lib/v3-entry";
import { deriveV3EntryCandidateReviewPresentation } from "@/lib/v3-entry-review-presentation";

function candidate(
  overrides: Partial<V3EntryCandidate> = {},
): V3EntryCandidate {
  return {
    id: "entry-1",
    artist: "Artist",
    songTitle: "Song",
    reviewStatus: "pending",
    reviewReason: null,
    contentRevision: 2,
    currentVersionId: "version-2",
    reviewedVersionId: null,
    reviewMatchesCurrentVersion: false,
    removed: false,
    ...overrides,
  };
}

describe("V3 Entry candidate review presentation", () => {
  it("shows accepted truth only when the review matches the current immutable version", () => {
    expect(
      deriveV3EntryCandidateReviewPresentation(
        candidate({
          reviewStatus: "accepted",
          reviewedVersionId: "version-2",
          reviewMatchesCurrentVersion: true,
        }),
      ),
    ).toEqual({ label: "Current version accepted", tone: "accepted" });

    expect(
      deriveV3EntryCandidateReviewPresentation(
        candidate({
          reviewStatus: "accepted",
          reviewedVersionId: "version-1",
          reviewMatchesCurrentVersion: false,
        }),
      ),
    ).toEqual({
      label: "Older version accepted · review current version",
      tone: "attention",
    });
  });

  it("does not present an older decline as a current changes-required state", () => {
    expect(
      deriveV3EntryCandidateReviewPresentation(
        candidate({
          reviewStatus: "declined",
          reviewedVersionId: "version-1",
          reviewMatchesCurrentVersion: false,
        }),
      ),
    ).toEqual({
      label: "Previous version declined · review current version",
      tone: "attention",
    });
  });

  it("keeps a decline dangerous only when it matches the current version", () => {
    expect(
      deriveV3EntryCandidateReviewPresentation(
        candidate({
          reviewStatus: "declined",
          reviewedVersionId: "version-2",
          reviewMatchesCurrentVersion: true,
        }),
      ),
    ).toEqual({ label: "Changes required", tone: "danger" });
  });

  it("does not promote legacy decline evidence to current workflow truth", () => {
    expect(
      deriveV3EntryCandidateReviewPresentation(
        candidate({
          reviewStatus: "declined",
          currentVersionId: null,
          reviewedVersionId: null,
          reviewMatchesCurrentVersion: false,
        }),
      ),
    ).toEqual({ label: "Legacy decline evidence", tone: "attention" });
  });

  it("lets canonical removal override stale review evidence", () => {
    expect(
      deriveV3EntryCandidateReviewPresentation(
        candidate({
          removed: true,
          reviewStatus: "accepted",
          reviewedVersionId: "version-1",
          reviewMatchesCurrentVersion: false,
        }),
      ),
    ).toEqual({ label: "Removed by organizer", tone: "danger" });
  });

  it("keeps pending current versions in waiting state", () => {
    expect(deriveV3EntryCandidateReviewPresentation(candidate())).toEqual({
      label: "Waiting for organizer review",
      tone: "attention",
    });
  });
});
