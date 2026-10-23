import { describe, expect, it } from "vitest";

import type { V3EntryCandidate, V3EntryProjection } from "./v3-entry";
import { resolveV3EntryMediaTarget } from "./v3-entry-media-target";

function candidate(id: string): V3EntryCandidate {
  return {
    id,
    artist: "Artist",
    songTitle: "Song",
    reviewStatus: "pending",
    reviewReason: null,
    contentRevision: 1,
    currentVersionId: "version-1",
    reviewedVersionId: null,
    reviewMatchesCurrentVersion: false,
    removed: false,
  };
}

function projection(
  confirmation: V3EntryProjection["confirmation"],
): V3EntryProjection {
  return {
    state: "ready",
    edition: { id: "edition-1", label: "SSC 22" },
    delegation: { id: "country-1", name: "Oland", code: "OLA" },
    confirmation,
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

function confirmation(
  input: Partial<NonNullable<V3EntryProjection["confirmation"]>> = {},
): NonNullable<V3EntryProjection["confirmation"]> {
  return {
    submissionId: "submission-1",
    roundId: "round-1",
    roundName: "Confirmation",
    submittedAt: "2026-10-23T10:00:00Z",
    updatedAt: "2026-10-23T10:00:00Z",
    selectionMethod: "internal",
    canEdit: true,
    editReason: null,
    receipt: null,
    internalEntry: null,
    nationalFinal: null,
    ...input,
  };
}

describe("V3 Entry media target", () => {
  it("binds internal selection media to the exact canonical Entry", () => {
    const result = resolveV3EntryMediaTarget(
      projection(confirmation({ internalEntry: candidate("entry-internal") })),
    );

    expect(result).toEqual({
      entryId: "entry-internal",
      source: "internal_entry",
    });
  });

  it("binds National Final media only after an exact winner is selected", () => {
    const entries = [candidate("entry-a"), candidate("entry-b")];
    const result = resolveV3EntryMediaTarget(
      projection(
        confirmation({
          selectionMethod: "national_final",
          nationalFinal: {
            id: "nf-1",
            name: "National Final",
            winnerEntryId: "entry-b",
            entries,
          },
        }),
      ),
    );

    expect(result).toEqual({
      entryId: "entry-b",
      source: "national_final_winner",
    });
  });

  it("does not guess a National Final target from candidate order", () => {
    const entries = [candidate("entry-a"), candidate("entry-b")];

    expect(
      resolveV3EntryMediaTarget(
        projection(
          confirmation({
            selectionMethod: "national_final",
            nationalFinal: {
              id: "nf-1",
              name: "National Final",
              winnerEntryId: null,
              entries,
            },
          }),
        ),
      ),
    ).toBeNull();
  });

  it("fails closed when the winner identity is not part of the canonical candidates", () => {
    expect(
      resolveV3EntryMediaTarget(
        projection(
          confirmation({
            selectionMethod: "national_final",
            nationalFinal: {
              id: "nf-1",
              name: "National Final",
              winnerEntryId: "entry-missing",
              entries: [candidate("entry-a")],
            },
          }),
        ),
      ),
    ).toBeNull();
  });

  it("fails closed when both selection models are present", () => {
    expect(
      resolveV3EntryMediaTarget(
        projection(
          confirmation({
            internalEntry: candidate("entry-internal"),
            nationalFinal: {
              id: "nf-1",
              name: "National Final",
              winnerEntryId: "entry-b",
              entries: [candidate("entry-b")],
            },
          }),
        ),
      ),
    ).toBeNull();
  });

  it("returns no target before canonical Entry state exists", () => {
    expect(resolveV3EntryMediaTarget(projection(null))).toBeNull();

    const noDelegation = projection(confirmation({ internalEntry: candidate("entry-1") }));
    noDelegation.state = "no-delegation";
    expect(resolveV3EntryMediaTarget(noDelegation)).toBeNull();
  });
});
