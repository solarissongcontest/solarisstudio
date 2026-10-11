import { describe, expect, it } from "vitest";

import { v3BlockedAction, v3ErrorState } from "./v3-error-state";

describe("V3 error-state policy", () => {
  it("preserves drafts on connection errors", () => {
    expect(v3ErrorState("connection")).toMatchObject({
      retryable: true,
      preserveDraft: true,
      primaryAction: "retry",
    });
  });

  it("does not encourage retry while a submission is uncertain", () => {
    expect(v3ErrorState("submission_uncertain")).toMatchObject({
      retryable: false,
      preserveDraft: true,
      primaryAction: "wait",
    });
    expect(v3ErrorState("submission_uncertain").detail).toContain("Don't submit again");
  });

  it("routes cross-device conflicts into explicit resolution", () => {
    expect(v3ErrorState("conflict")).toMatchObject({
      primaryAction: "resolve_conflict",
      preserveDraft: true,
      retryable: false,
    });
  });

  it("distinguishes canonical state changes from generic server failure", () => {
    expect(v3ErrorState("state_changed").primaryAction).toBe("refresh");
    expect(v3ErrorState("server").primaryAction).toBe("retry");
  });

  it("explains offline final-action restrictions without destroying local work", () => {
    expect(v3ErrorState("offline")).toMatchObject({
      title: "You're offline",
      retryable: false,
      preserveDraft: true,
    });
  });

  it("requires every blocked action to explain why it is blocked", () => {
    expect(v3BlockedAction("Submit jury", "Complete all 15 rankings first.")).toEqual({
      label: "Submit jury",
      reason: "Complete all 15 rankings first.",
      actionable: false,
    });
    expect(() => v3BlockedAction("Submit jury", "")).toThrow("explanation");
  });
});
