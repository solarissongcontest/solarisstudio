export type V3WorkflowActivity =
  | "idle"
  | "browsing"
  | "editing_draft"
  | "reviewing_submission"
  | "submitting"
  | "submission_uncertain"
  | "organizer_critical";

export type V3UpdateState = "none" | "available" | "required";

export type V3UpdateDecision = {
  applyNow: boolean;
  defer: boolean;
  blockInteraction: boolean;
  reason:
    | "no_update"
    | "safe_idle"
    | "critical_workflow_active"
    | "required_update_safe"
    | "required_update_blocked_by_submission";
};

function workflowUnsafeForReload(activity: V3WorkflowActivity) {
  return (
    activity === "editing_draft" ||
    activity === "reviewing_submission" ||
    activity === "submitting" ||
    activity === "submission_uncertain" ||
    activity === "organizer_critical"
  );
}

/**
 * Service-worker/client updates must never replace the running app underneath a
 * critical workflow. Required updates can block new work, but even then an
 * in-flight/uncertain submission must first reconcile or reach a safe boundary.
 */
export function decideV3Update(
  update: V3UpdateState,
  activity: V3WorkflowActivity,
): V3UpdateDecision {
  if (update === "none") {
    return {
      applyNow: false,
      defer: false,
      blockInteraction: false,
      reason: "no_update",
    };
  }

  const unsafe = workflowUnsafeForReload(activity);

  if (update === "available") {
    return unsafe
      ? {
          applyNow: false,
          defer: true,
          blockInteraction: false,
          reason: "critical_workflow_active",
        }
      : {
          applyNow: true,
          defer: false,
          blockInteraction: false,
          reason: "safe_idle",
        };
  }

  if (activity === "submitting" || activity === "submission_uncertain") {
    return {
      applyNow: false,
      defer: true,
      blockInteraction: true,
      reason: "required_update_blocked_by_submission",
    };
  }

  if (unsafe) {
    return {
      applyNow: false,
      defer: true,
      blockInteraction: true,
      reason: "critical_workflow_active",
    };
  }

  return {
    applyNow: true,
    defer: false,
    blockInteraction: true,
    reason: "required_update_safe",
  };
}

export type V3ResumeContext = {
  backgroundedAt: string;
  resumedAt: string;
  hadActiveRequiredAction: boolean;
  hadCriticalWorkflow: boolean;
  online: boolean;
};

export type V3ResumePlan = {
  refreshAuth: boolean;
  refreshBootstrap: boolean;
  refreshDeadlines: boolean;
  reconcileCriticalWorkflow: boolean;
  backgroundRefreshOnly: boolean;
};

export function projectV3ResumePlan(context: V3ResumeContext): V3ResumePlan {
  const backgroundedAt = Date.parse(context.backgroundedAt);
  const resumedAt = Date.parse(context.resumedAt);
  if (!Number.isFinite(backgroundedAt) || !Number.isFinite(resumedAt) || resumedAt < backgroundedAt) {
    throw new Error("V3 lifecycle requires valid ordered background/resume timestamps.");
  }

  const elapsed = resumedAt - backgroundedAt;
  const minute = 60_000;

  if (!context.online) {
    return {
      refreshAuth: false,
      refreshBootstrap: false,
      refreshDeadlines: false,
      reconcileCriticalWorkflow: false,
      backgroundRefreshOnly: true,
    };
  }

  return {
    refreshAuth: elapsed >= 15 * minute,
    refreshBootstrap: elapsed >= 2 * minute || context.hadActiveRequiredAction || context.hadCriticalWorkflow,
    refreshDeadlines: elapsed >= minute || context.hadActiveRequiredAction || context.hadCriticalWorkflow,
    reconcileCriticalWorkflow: context.hadCriticalWorkflow,
    backgroundRefreshOnly: true,
  };
}
