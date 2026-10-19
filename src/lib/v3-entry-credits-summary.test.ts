import { describe, expect, it } from "vitest";

import type { V3EntryCandidate, V3EntryProjection } from "./v3-entry";
import { v3EntryCreditSummaryRows } from "./v3-entry-credits-summary";

function candidate(
  id: string,
  songTitle: string,
  credits: V3EntryCandidate["credits"],
): V3EntryCandidate {
  return {
    id,
    artist: `Artist ${id}`,
    songTitle,
    credits,
    reviewStatus: "pending",
    reviewReason: null,
    contentRevision: 1,
    currentVersionId: `version-${id}`,
    reviewedVersionId: null,
    reviewMatchesCurrentVersion: false,
    removed: false,
  };
}

function projection(): V3EntryProjection {
  return {
    state: "ready",
    edition: { id: "edition-1", label: "SSC 22" },
    delegation: { id: "country-1", name: "Country", code: "CTR" },
    confirmation: {
      submissionId: "submission-1",
      roundId: "round-1",
      roundName: "Confirmation",
      submittedAt: "2026-10-18T12:00:00.000Z",
      updatedAt: "2026-10-18T12:00:00.000Z",
      selectionMethod: "internal",
      canEdit: true,
      editReason: null,
      receipt: null,
      internalEntry: candidate("entry-1", "Song One", [
        { role: "composer", name: "A. Composer" },
      ]),
      nationalFinal: null,
    },
    readiness: {
      score: 100,
      state: "ready",
      eligibilityStatus: "eligible",
      checks: [],
      actions: [],
    },
    versionHistory: [],
  };
}

describe("V3 Entry Credits summary", () => {
  it("uses only the current caller-scoped internal Entry Credits", () => {
    expect(v3EntryCreditSummaryRows(projection())).toEqual([
      {
        id: "entry-1",
        label: "Song One",
        credits: [{ role: "composer", name: "A. Composer" }],
        selected: true,
      },
    ]);
  });

  it("keeps National Final candidate Credits distinct and marks only the canonical winner", () => {
    const value = projection();
    value.confirmation = {
      ...value.confirmation!,
      selectionMethod: "national_final",
      internalEntry: null,
      nationalFinal: {
        id: "nf-1",
        name: "National Final",
        winnerEntryId: "entry-2",
        entries: [
          candidate("entry-2", "Winner", [{ role: "lyricist", name: "L. Writer" }]),
          candidate("entry-3", "Runner-up", [{ role: "producer", name: "P. Producer" }]),
        ],
      },
    };

    expect(v3EntryCreditSummaryRows(value).map((row) => ({ id: row.id, selected: row.selected }))).toEqual([
      { id: "entry-2", selected: true },
      { id: "entry-3", selected: false },
    ]);
  });

  it("does not invent Credits when the canonical projection contains none", () => {
    const value = projection();
    value.confirmation = {
      ...value.confirmation!,
      internalEntry: candidate("entry-1", "Song One", []),
    };
    expect(v3EntryCreditSummaryRows(value)).toEqual([]);
  });
});
