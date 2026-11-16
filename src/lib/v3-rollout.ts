export type V3RolloutStage = "disabled" | "preview" | "cohort" | "enabled";

export type V3RolloutContext = {
  userId: string | null;
  editionId: string | null;
  isOrganizer: boolean;
};

export type V3RolloutRule = {
  stage: V3RolloutStage;
  userIds?: readonly string[];
  editionIds?: readonly string[];
  organizersOnly?: boolean;
};

export type V3RolloutDecision = {
  enabled: boolean;
  stage: V3RolloutStage;
  reason:
    | "disabled"
    | "enabled"
    | "preview_not_allowed"
    | "user_not_in_cohort"
    | "edition_not_in_cohort"
    | "organizer_required"
    | "invalid_policy";
};

export const DEFAULT_V3_ROLLOUT_RULE: Readonly<V3RolloutRule> = Object.freeze({
  stage: "disabled",
});

function validRolloutIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every((id) => typeof id === "string" && id.trim().length > 0);
}

/**
 * JSON policies are untrusted at runtime even when callers use TypeScript.
 * In particular, a string userIds/editionIds value has String.includes()
 * semantics and could accidentally admit a substring of a tester ID.
 */
function validRolloutInputs(rule: unknown, context: unknown): boolean {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return false;
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const policy = rule as Record<string, unknown>;
  const viewer = context as Record<string, unknown>;
  if (!["disabled", "preview", "cohort", "enabled"].includes(String(policy.stage))) return false;
  if (policy.userIds !== undefined && !validRolloutIds(policy.userIds)) return false;
  if (policy.editionIds !== undefined && !validRolloutIds(policy.editionIds)) return false;
  if (policy.organizersOnly !== undefined && typeof policy.organizersOnly !== "boolean") return false;
  if (viewer.userId !== null && typeof viewer.userId !== "string") return false;
  if (viewer.editionId !== null && typeof viewer.editionId !== "string") return false;
  if (typeof viewer.isOrganizer !== "boolean") return false;
  return true;
}

/**
 * V3 rollout is evaluated from server-supplied policy and authenticated context.
 * Local storage is intentionally not part of this contract, so a production
 * user cannot accidentally opt themselves into an unfinished app shell.
 */
export function evaluateV3Rollout(
  rule: V3RolloutRule | null | undefined,
  context: V3RolloutContext,
): V3RolloutDecision {
  const resolved = rule ?? DEFAULT_V3_ROLLOUT_RULE;

  if (!validRolloutInputs(resolved, context)) {
    return { enabled: false, stage: "disabled", reason: "invalid_policy" };
  }

  if (resolved.stage === "disabled") {
    return { enabled: false, stage: resolved.stage, reason: "disabled" };
  }

  if (resolved.organizersOnly && !context.isOrganizer) {
    return { enabled: false, stage: resolved.stage, reason: "organizer_required" };
  }

  if (resolved.editionIds?.length) {
    if (!context.editionId || !resolved.editionIds.includes(context.editionId)) {
      return { enabled: false, stage: resolved.stage, reason: "edition_not_in_cohort" };
    }
  }

  if (resolved.stage === "preview") {
    if (!resolved.userIds?.length || !context.userId || !resolved.userIds.includes(context.userId)) {
      return { enabled: false, stage: resolved.stage, reason: "preview_not_allowed" };
    }
    return { enabled: true, stage: resolved.stage, reason: "enabled" };
  }

  if (resolved.stage === "cohort") {
    if (!resolved.userIds?.length || !context.userId || !resolved.userIds.includes(context.userId)) {
      return { enabled: false, stage: resolved.stage, reason: "user_not_in_cohort" };
    }
  }

  return { enabled: true, stage: resolved.stage, reason: "enabled" };
}
