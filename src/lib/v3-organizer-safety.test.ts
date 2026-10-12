import { describe, expect, it } from "vitest";

import {
  assertV3OrganizerContext,
  projectV3OrganizerContextSwitch,
  v3OrganizerConfirmationCopy,
  v3OrganizerContextKey,
  v3OrganizerOperationPolicy,
} from "./v3-organizer-safety";

const finalContext = {
  editionId: "22",
  editionLabel: "SSC 22",
  showId: "final",
  showLabel: "Final",
} as const;

describe("V3 organizer safety", () => {
  it("assigns progressively stronger safeguards to higher-risk operations", () => {
    expect(v3OrganizerOperationPolicy("edit_copy")).toMatchObject({
      riskTier: 1,
      requiresReview: false,
      requiresReauthentication: false,
    });
    expect(v3OrganizerOperationPolicy("close_voting")).toMatchObject({
      riskTier: 3,
      requiresReview: true,
      requiresExplicitConsequence: true,
    });
    expect(v3OrganizerOperationPolicy("override_official_result")).toMatchObject({
      riskTier: 4,
      requiresReview: true,
      requiresReauthentication: true,
    });
  });

  it("allows undo only where the operation contract says it is actually safe", () => {
    expect(v3OrganizerOperationPolicy("edit_copy").supportsUndo).toBe(true);
    expect(v3OrganizerOperationPolicy("save_draft_schedule").supportsUndo).toBe(true);
    expect(v3OrganizerOperationPolicy("send_reminder").supportsUndo).toBe(false);
    expect(v3OrganizerOperationPolicy("publish_results").supportsUndo).toBe(false);
  });

  it("creates a context key that includes the show when relevant", () => {
    expect(v3OrganizerContextKey(finalContext)).toBe("22:final");
    expect(
      v3OrganizerContextKey({ editionId: "22", editionLabel: "SSC 22" }),
    ).toBe("22:edition");
  });

  it("rejects a destructive flow if the edition changed underneath it", () => {
    expect(() =>
      assertV3OrganizerContext(finalContext, {
        editionId: "21",
        editionLabel: "SSC 21",
        showId: "final",
        showLabel: "Final",
      }),
    ).toThrow("edition context changed");
  });

  it("rejects a destructive flow if only the show changed", () => {
    expect(() =>
      assertV3OrganizerContext(finalContext, {
        ...finalContext,
        showId: "semi-1",
        showLabel: "Semi-final 1",
      }),
    ).toThrow("show context changed");
  });

  it("requires context switches to close destructive UI and reload canonical state", () => {
    expect(
      projectV3OrganizerContextSwitch(finalContext, {
        editionId: "23",
        editionLabel: "SSC 23",
      }),
    ).toMatchObject({
      closeDestructiveFlows: true,
      clearEditionScopedCache: true,
      clearShowScopedCache: true,
      resetSelectedShow: true,
      reloadCanonicalState: true,
    });
  });

  it("does not clear edition cache for a show-only switch but does clear show state", () => {
    expect(
      projectV3OrganizerContextSwitch(finalContext, {
        ...finalContext,
        showId: "semi-1",
        showLabel: "Semi-final 1",
      }),
    ).toMatchObject({
      clearEditionScopedCache: false,
      clearShowScopedCache: true,
      resetSelectedShow: false,
    });
  });

  it("puts the exact edition and show into high-risk confirmation copy", () => {
    const copy = v3OrganizerConfirmationCopy("publish_results", finalContext);
    expect(copy.contextLabel).toBe("SSC 22 · Final");
    expect(copy.title).toBe("Publish results?");
    expect(copy.consequence).toContain("Official results");
  });

  it("makes destructive edition operations explicit and irreversible in copy", () => {
    const copy = v3OrganizerConfirmationCopy("delete_edition", {
      editionId: "22",
      editionLabel: "SSC 22",
    });
    expect(copy.contextLabel).toBe("SSC 22");
    expect(copy.consequence).toContain("not undoable");
    expect(v3OrganizerOperationPolicy("delete_edition").requiresReauthentication).toBe(true);
  });
});
