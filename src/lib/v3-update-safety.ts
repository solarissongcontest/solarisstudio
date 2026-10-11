export type V3WorkflowActivity =
  | "idle"
  | "confirmation"
  | "entry"
  | "media"
  | "jury"
  | "televote"
  | "organizer-critical";

export type V3UpdateState =
  | "none"
  | "available"
  | "deferred"
  | "ready"
  | "required";

export type V3UpdateDecision = {
  state: V3UpdateState;
  mayActivateNow: boolean;
  shouldPrompt: boolean;
  reason:
    | "no_update"
    | "safe_idle"
    | "critical_workflow_active"
    | "unsaved_local_changes"
    | "required_update";
};

export type V3UpdateContext = {
  updateAvailable: boolean;
  required?: boolean;
  activity: V3WorkflowActivity;
  hasUnsavedLocalChanges: boolean;
};

const CRITICAL_ACTIVITIES = new Set<V3WorkflowActivity>([
  "confirmation",
  "entry",
  "media",
  "jury",
  "televote",
  "organizer-critical",
]);

/**
 * Decide whether a newly installed service-worker/client bundle may activate.
 *
 * V3 must never reload underneath an active submission or silently discard a
 * local draft merely because a new frontend version exists. Required updates
 * may prompt immediately, but even then the caller is expected to persist any
 * local draft before activation.
 */
export function evaluateV3UpdateSafety(context: V3UpdateContext): V3UpdateDecision {
  if (!context.updateAvailable) {
    return {
      state: "none",
      mayActivateNow: false,
      shouldPrompt: false,
      reason: "no_update",
    };
  }

  if (context.required) {
    return {
      state: "required",
      mayActivateNow: !context.hasUnsavedLocalChanges,
      shouldPrompt: true,
      reason: "required_update",
    };
  }

  if (context.hasUnsavedLocalChanges) {
    return {
      state: "deferred",
      mayActivateNow: false,
      shouldPrompt: false,
      reason: "unsaved_local_changes",
    };
  }

  if (CRITICAL_ACTIVITIES.has(context.activity)) {
    return {
      state: "deferred",
      mayActivateNow: false,
      shouldPrompt: false,
      reason: "critical_workflow_active",
    };
  }

  return {
    state: "ready",
    mayActivateNow: true,
    shouldPrompt: true,
    reason: "safe_idle",
  };
}
