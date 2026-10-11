import { describe, expect, it } from "vitest";

import { decideV3Update, projectV3ResumePlan } from "./v3-app-lifecycle";

describe("V3 app lifecycle", () => {
  it("applies a normal update immediately only at a safe boundary", () => {
    expect(decideV3Update("available", "idle")).toMatchObject({
      applyNow: true,
      defer: false,
      blockInteraction: false,
      reason: "safe_idle",
    });
  });

  it("defers an available update while a draft is being edited", () => {
    expect(decideV3Update("available", "editing_draft")).toMatchObject({
      applyNow: false,
      defer: true,
      blockInteraction: false,
      reason: "critical_workflow_active",
    });
  });

  it("never reloads over an in-flight or uncertain submission even for a required update", () => {
    expect(decideV3Update("required", "submitting")).toMatchObject({
      applyNow: false,
      defer: true,
      blockInteraction: true,
      reason: "required_update_blocked_by_submission",
    });
    expect(decideV3Update("required", "submission_uncertain")).toMatchObject({
      applyNow: false,
      defer: true,
      blockInteraction: true,
    });
  });

  it("can apply a required update at a safe idle boundary", () => {
    expect(decideV3Update("required", "browsing")).toMatchObject({
      applyNow: true,
      blockInteraction: true,
      reason: "required_update_safe",
    });
  });

  it("keeps offline resume on cached content without inventing network work", () => {
    expect(
      projectV3ResumePlan({
        backgroundedAt: "2026-10-11T16:00:00.000Z",
        resumedAt: "2026-10-11T16:20:00.000Z",
        hadActiveRequiredAction: true,
        hadCriticalWorkflow: true,
        online: false,
      }),
    ).toEqual({
      refreshAuth: false,
      refreshBootstrap: false,
      refreshDeadlines: false,
      reconcileCriticalWorkflow: false,
      backgroundRefreshOnly: true,
    });
  });

  it("refreshes deadline/action state aggressively after resuming required work", () => {
    expect(
      projectV3ResumePlan({
        backgroundedAt: "2026-10-11T16:00:00.000Z",
        resumedAt: "2026-10-11T16:00:30.000Z",
        hadActiveRequiredAction: true,
        hadCriticalWorkflow: false,
        online: true,
      }),
    ).toMatchObject({
      refreshBootstrap: true,
      refreshDeadlines: true,
      reconcileCriticalWorkflow: false,
    });
  });

  it("reconciles a critical workflow immediately on resume", () => {
    expect(
      projectV3ResumePlan({
        backgroundedAt: "2026-10-11T16:00:00.000Z",
        resumedAt: "2026-10-11T16:00:10.000Z",
        hadActiveRequiredAction: false,
        hadCriticalWorkflow: true,
        online: true,
      }),
    ).toMatchObject({
      refreshBootstrap: true,
      refreshDeadlines: true,
      reconcileCriticalWorkflow: true,
    });
  });

  it("refreshes auth after a longer background period without forcing a full reload", () => {
    expect(
      projectV3ResumePlan({
        backgroundedAt: "2026-10-11T16:00:00.000Z",
        resumedAt: "2026-10-11T16:20:00.000Z",
        hadActiveRequiredAction: false,
        hadCriticalWorkflow: false,
        online: true,
      }),
    ).toMatchObject({
      refreshAuth: true,
      refreshBootstrap: true,
      refreshDeadlines: true,
      backgroundRefreshOnly: true,
    });
  });

  it("rejects impossible resume timestamps", () => {
    expect(() =>
      projectV3ResumePlan({
        backgroundedAt: "2026-10-11T17:00:00.000Z",
        resumedAt: "2026-10-11T16:00:00.000Z",
        hadActiveRequiredAction: false,
        hadCriticalWorkflow: false,
        online: true,
      }),
    ).toThrow("valid ordered");
  });
});
