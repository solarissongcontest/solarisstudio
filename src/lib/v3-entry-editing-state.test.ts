import { describe, expect, it } from "vitest";

import type {
  V3EntryConfirmationProjection,
  V3EntryLifecycle,
  V3EntryLifecycleState,
} from "./v3-entry";
import { deriveV3EntryEditingPresentation } from "./v3-entry-editing-state";

function confirmation(
  canEdit: boolean,
  editReason: string | null,
): V3EntryConfirmationProjection {
  return {
    submissionId: "submission-1",
    roundId: "round-1",
    roundName: "Confirmation",
    submittedAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
    selectionMethod: "internal",
    canEdit,
    editReason,
    receipt: null,
    internalEntry: null,
    nationalFinal: null,
  };
}

function lifecycle(state: V3EntryLifecycleState): V3EntryLifecycle {
  return {
    state,
    issue: state === "changes-required" ? "Please correct the song credits." : null,
    affectedCandidateIds: [],
  };
}

describe("V3 Entry editing presentation", () => {
  it("does not invent an edit gate before a canonical response exists", () => {
    expect(
      deriveV3EntryEditingPresentation(null, lifecycle("not-submitted")),
    ).toMatchObject({ state: "not-applicable" });
  });

  it("presents changes-required plus server edit access as reopened correction editing", () => {
    expect(
      deriveV3EntryEditingPresentation(
        confirmation(true, null),
        lifecycle("changes-required"),
      ),
    ).toMatchObject({ state: "reopened", label: "Correction editing reopened" });
  });

  it("keeps ordinary server edit access distinct from review state", () => {
    expect(
      deriveV3EntryEditingPresentation(
        confirmation(true, null),
        lifecycle("awaiting-review"),
      ),
    ).toMatchObject({ state: "open", label: "Editing available" });
  });

  it("uses the server reason to distinguish locked from generally closed editing", () => {
    expect(
      deriveV3EntryEditingPresentation(
        confirmation(false, "locked"),
        lifecycle("accepted"),
      ),
    ).toMatchObject({ state: "locked", label: "Submission locked" });

    expect(
      deriveV3EntryEditingPresentation(
        confirmation(false, "editing_closed"),
        lifecycle("accepted"),
      ),
    ).toMatchObject({ state: "closed", label: "Editing closed" });
  });
});
