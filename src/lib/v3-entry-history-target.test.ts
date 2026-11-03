import { describe, expect, it } from "vitest";

import type { V3EntryCandidate, V3EntryConfirmationProjection, V3EntryLifecycle } from "./v3-entry";
import { resolveV3EntryHistoryTarget } from "./v3-entry-history-target";

function candidate(id: string, songTitle: string | null = id): V3EntryCandidate {
  return {
    id, artist: "Artist", songTitle, reviewStatus: "pending", reviewReason: null,
    contentRevision: 1, currentVersionId: "version-1", reviewedVersionId: null,
    reviewMatchesCurrentVersion: false, removed: false,
  };
}

function confirmation(
  selectionMethod: string,
  winnerEntryId: string | null,
  entries: V3EntryCandidate[] = [candidate("a"), candidate("b")],
): V3EntryConfirmationProjection {
  return {
    submissionId: "response-1", roundId: "round-1", roundName: "Confirmation",
    submittedAt: "2026-10-20T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z",
    selectionMethod, canEdit: false, editReason: "editing_closed", receipt: null,
    internalEntry: selectionMethod === "internal" ? candidate("internal") : null,
    nationalFinal: selectionMethod === "national_final"
      ? { id: "nf-1", name: "National Final", winnerEntryId, entries }
      : null,
  };
}

function lifecycle(...affectedCandidateIds: string[]): V3EntryLifecycle {
  return { state: "awaiting-review", issue: null, affectedCandidateIds };
}

describe("V3 participant Entry immutable-history target", () => {
  it("keeps the canonical internal entry history", () => {
    expect(resolveV3EntryHistoryTarget(confirmation("internal", null), lifecycle())).toEqual({
      targetType: "internal", entryId: "internal", label: "internal",
    });
  });

  it("uses only an exactly matched national-final winner", () => {
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", "b"), lifecycle())).toEqual({
      targetType: "national_final", entryId: "b", label: "b",
    });
  });

  it("never guesses a winner or revision history from candidate ordering", () => {
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", null), lifecycle())).toBeNull();
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", "missing"), lifecycle())).toBeNull();
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", null, [candidate("a")]), lifecycle())).toBeNull();
  });

  it("can show the exact single candidate with an organizer correction", () => {
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", null), lifecycle("a"))).toEqual({
      targetType: "national_final", entryId: "a", label: "a",
    });
  });

  it("does not arbitrarily select among multiple affected candidates", () => {
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", null), lifecycle("a", "b"))).toBeNull();
    expect(resolveV3EntryHistoryTarget(confirmation("national_final", "b"), lifecycle("a", "b"))).toMatchObject({
      entryId: "b",
    });
  });

  it("rejects duplicate candidate identifiers and mismatched selection methods", () => {
    expect(resolveV3EntryHistoryTarget(
      confirmation("national_final", "a", [candidate("a"), candidate("a")]), lifecycle(),
    )).toBeNull();
    expect(resolveV3EntryHistoryTarget(confirmation("unknown", null), lifecycle())).toBeNull();
    expect(resolveV3EntryHistoryTarget(null, lifecycle())).toBeNull();
  });

  it("labels history with exact canonical candidate identity, not a guessed name", () => {
    const selected = candidate("b", null);
    expect(resolveV3EntryHistoryTarget(
      confirmation("national_final", "b", [candidate("a"), selected]), lifecycle(),
    )).toMatchObject({ entryId: "b", label: "Artist" });
  });
});
