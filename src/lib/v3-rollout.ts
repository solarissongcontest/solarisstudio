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
    | "organizer_required";
};

export const DEFAULT_V3_ROLLOUT_RULE: Readonly<V3RolloutRule> = Object.freeze({
  stage: "disabled",
});

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
