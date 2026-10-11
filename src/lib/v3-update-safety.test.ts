import { describe, expect, it } from "vitest";

import { evaluateV3UpdateSafety } from "./v3-update-safety";

describe("evaluateV3UpdateSafety", () => {
  it("does nothing when no update exists", () => {
    expect(
      evaluateV3UpdateSafety({
        updateAvailable: false,
        activity: "idle",
        hasUnsavedLocalChanges: false,
      }),
    ).toEqual({
      state: "none",
      mayActivateNow: false,
      shouldPrompt: false,
      reason: "no_update",
    });
  });

  it("allows a normal update only from a safe idle state", () => {
    expect(
      evaluateV3UpdateSafety({
        updateAvailable: true,
        activity: "idle",
        hasUnsavedLocalChanges: false,
      }),
    ).toEqual({
      state: "ready",
      mayActivateNow: true,
      shouldPrompt: true,
      reason: "safe_idle",
    });
  });

  it.each(["confirmation", "entry", "media", "jury", "televote", "organizer-critical"] as const)(
    "defers activation during %s work",
    (activity) => {
      expect(
        evaluateV3UpdateSafety({
          updateAvailable: true,
          activity,
          hasUnsavedLocalChanges: false,
        }),
      ).toMatchObject({
        state: "deferred",
        mayActivateNow: false,
        shouldPrompt: false,
        reason: "critical_workflow_active",
      });
    },
  );

  it("defers even from idle when local changes are unsaved", () => {
    expect(
      evaluateV3UpdateSafety({
        updateAvailable: true,
        activity: "idle",
        hasUnsavedLocalChanges: true,
      }),
    ).toMatchObject({
      state: "deferred",
      mayActivateNow: false,
      shouldPrompt: false,
      reason: "unsaved_local_changes",
    });
  });

  it("prompts for a required update but does not activate over unsaved changes", () => {
    expect(
      evaluateV3UpdateSafety({
        updateAvailable: true,
        required: true,
        activity: "jury",
        hasUnsavedLocalChanges: true,
      }),
    ).toEqual({
      state: "required",
      mayActivateNow: false,
      shouldPrompt: true,
      reason: "required_update",
    });
  });

  it("permits a required update after local changes are safe", () => {
    expect(
      evaluateV3UpdateSafety({
        updateAvailable: true,
        required: true,
        activity: "jury",
        hasUnsavedLocalChanges: false,
      }),
    ).toMatchObject({
      state: "required",
      mayActivateNow: true,
      shouldPrompt: true,
      reason: "required_update",
    });
  });
});
