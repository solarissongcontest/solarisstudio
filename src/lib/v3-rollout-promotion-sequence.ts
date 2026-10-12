import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";

export type V3RolloutLifecycleStage =
  | "legacy"
  | "shadow"
  | "limited"
  | "full"
  | "retired";

export type V3ActiveRolloutStage = Exclude<V3RolloutLifecycleStage, "legacy">;

export type V3RolloutState =
  | {
      stage: "legacy";
      candidateSha: null;
      deploymentIdentityKey: null;
      enteredAt: string;
    }
  | {
      stage: V3ActiveRolloutStage;
      candidateSha: string;
      deploymentIdentityKey: string;
      enteredAt: string;
    };

export type V3RolloutPromotionPolicy = {
  minShadowObservationMs: number;
  minLimitedObservationMs: number;
  minFullObservationMsBeforeRetirement: number;
};

export type V3RolloutTransitionBlocker = {
  id: string;
  reason: string;
};

export type V3RolloutTransitionDecision = {
  allowed: boolean;
  kind: "promotion" | "deployment_restart";
  from: V3RolloutLifecycleStage;
  to: V3ActiveRolloutStage;
  candidateSha: string;
  deploymentIdentityKey: string;
  elapsedInCurrentStageMs: number;
  requiredObservationMs: number;
  blockers: readonly V3RolloutTransitionBlocker[];
  nextState: V3RolloutState | null;
};

const STAGE_ORDER: Readonly<Record<V3RolloutLifecycleStage, number>> = {
  legacy: 0,
  shadow: 1,
  limited: 2,
  full: 3,
  retired: 4,
};

function fullSha(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return normalized;
}

function deploymentIdentityKey(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized.length > 1024) {
    throw new Error(`${label} must not exceed 1024 characters.`);
  }
  return normalized;
}

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  const parsed = Date.parse(normalized);
  if (!normalized || Number.isNaN(parsed)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return { value: normalized, ms: parsed };
}

function duration(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function normalizedPolicy(
  policy: V3RolloutPromotionPolicy,
): V3RolloutPromotionPolicy {
  return {
    minShadowObservationMs: duration(
      policy.minShadowObservationMs,
      "minShadowObservationMs",
    ),
    minLimitedObservationMs: duration(
      policy.minLimitedObservationMs,
      "minLimitedObservationMs",
    ),
    minFullObservationMsBeforeRetirement: duration(
      policy.minFullObservationMsBeforeRetirement,
      "minFullObservationMsBeforeRetirement",
    ),
  };
}

function validateState(state: V3RolloutState) {
  timestamp(state.enteredAt, "rollout.enteredAt");
  if (state.stage === "legacy") {
    if (state.candidateSha !== null || state.deploymentIdentityKey !== null) {
      throw new Error(
        "Legacy rollout state cannot carry V3 candidate/deployment identity.",
      );
    }
    return;
  }
  fullSha(state.candidateSha, "rollout.candidateSha");
  deploymentIdentityKey(
    state.deploymentIdentityKey,
    "rollout.deploymentIdentityKey",
  );
}

function evidenceTargetForStage(stage: V3ActiveRolloutStage) {
  switch (stage) {
    case "shadow":
      return "shadow" as const;
    case "limited":
      return "limited" as const;
    case "full":
      return "full" as const;
    case "retired":
      return "retire_legacy" as const;
  }
}

function requiredObservationMs(
  from: V3RolloutLifecycleStage,
  to: V3ActiveRolloutStage,
  policy: V3RolloutPromotionPolicy,
) {
  if (from === "shadow" && to === "limited") {
    return policy.minShadowObservationMs;
  }
  if (from === "limited" && to === "full") {
    return policy.minLimitedObservationMs;
  }
  if (from === "full" && to === "retired") {
    return policy.minFullObservationMsBeforeRetirement;
  }
  return 0;
}

function isSequentialPromotion(
  from: V3RolloutLifecycleStage,
  to: V3ActiveRolloutStage,
) {
  return STAGE_ORDER[to] === STAGE_ORDER[from] + 1;
}

/**
 * Evaluates an upward V3 rollout transition using candidate-bound release
 * evidence plus the stable deployment identity being promoted.
 *
 * Deployment identity represents code/deployment/schema/environment and must
 * stay stable while rollout policy legitimately evolves from shadow to limited
 * to full. Policy revisions belong to the observation scope, not this state.
 * A new code SHA or changed deployment identity may never inherit the old
 * deployment's stage and must explicitly restart at shadow.
 */
export function evaluateV3RolloutTransition(input: {
  current: V3RolloutState;
  to: V3ActiveRolloutStage;
  evidence: V3ReleaseCandidateDecision;
  deploymentIdentityKey: string;
  policy: V3RolloutPromotionPolicy;
  now: string;
}): V3RolloutTransitionDecision {
  validateState(input.current);
  const policy = normalizedPolicy(input.policy);
  const now = timestamp(input.now, "rollout.now");
  const entered = timestamp(input.current.enteredAt, "rollout.enteredAt");
  if (now.ms < entered.ms) {
    throw new Error("rollout.now cannot be before the current stage enteredAt.");
  }

  const candidateSha = fullSha(
    input.evidence.candidateSha,
    "evidence.candidateSha",
  );
  const nextDeploymentIdentityKey = deploymentIdentityKey(
    input.deploymentIdentityKey,
    "deploymentIdentityKey",
  );
  const elapsedInCurrentStageMs = now.ms - entered.ms;
  const currentCandidate =
    input.current.stage === "legacy"
      ? null
      : fullSha(input.current.candidateSha, "rollout.candidateSha");
  const currentDeploymentIdentityKey =
    input.current.stage === "legacy"
      ? null
      : deploymentIdentityKey(
          input.current.deploymentIdentityKey,
          "rollout.deploymentIdentityKey",
        );
  const deploymentChanged =
    currentCandidate !== null &&
    (currentCandidate !== candidateSha ||
      currentDeploymentIdentityKey !== nextDeploymentIdentityKey);
  const kind = deploymentChanged ? "deployment_restart" : "promotion";
  const requiredMs = deploymentChanged
    ? 0
    : requiredObservationMs(input.current.stage, input.to, policy);
  const blockers: V3RolloutTransitionBlocker[] = [];

  if (input.current.stage === "retired") {
    blockers.push({
      id: "legacy_already_retired",
      reason:
        "The legacy workflow is already retired; staged rollout transitions are closed for this state.",
    });
  }

  if (deploymentChanged && input.to !== "shadow") {
    blockers.push({
      id: "deployment_changed_restart_shadow",
      reason:
        "A new V3 deployment identity cannot inherit the previous deployment's rollout stage; restart it at shadow.",
    });
  } else if (
    !deploymentChanged &&
    !isSequentialPromotion(input.current.stage, input.to)
  ) {
    blockers.push({
      id: "non_sequential_promotion",
      reason: `V3 rollout cannot promote directly from ${input.current.stage} to ${input.to}.`,
    });
  }

  const expectedEvidenceTarget = evidenceTargetForStage(input.to);
  if (input.evidence.target !== expectedEvidenceTarget) {
    blockers.push({
      id: "evidence_wrong_stage",
      reason: `Release evidence targets ${input.evidence.target}, not ${expectedEvidenceTarget}.`,
    });
  }
  if (!input.evidence.ready) {
    blockers.push({
      id: "release_evidence_blocked",
      reason:
        input.evidence.blockers.map((item) => item.reason).join(" ") ||
        "Release evidence is not ready for promotion.",
    });
  } else if (input.evidence.blockers.length > 0) {
    blockers.push({
      id: "release_evidence_inconsistent",
      reason:
        "Release evidence is marked ready while candidate blockers are still present.",
    });
  }

  if (!deploymentChanged && elapsedInCurrentStageMs < requiredMs) {
    blockers.push({
      id: "observation_window_incomplete",
      reason: `The current ${input.current.stage} stage has not satisfied its required observation window.`,
    });
  }

  const allowed = blockers.length === 0;
  const nextState: V3RolloutState | null = allowed
    ? {
        stage: input.to,
        candidateSha,
        deploymentIdentityKey: nextDeploymentIdentityKey,
        enteredAt: now.value,
      }
    : null;

  return {
    allowed,
    kind,
    from: input.current.stage,
    to: input.to,
    candidateSha,
    deploymentIdentityKey: nextDeploymentIdentityKey,
    elapsedInCurrentStageMs,
    requiredObservationMs: requiredMs,
    blockers,
    nextState,
  };
}

/**
 * Safety rollback is deliberately immediate and evidence-free.
 *
 * Moving downward preserves the exact active deployment identity. Returning to
 * legacy clears it because V3 is no longer the staged-rollout owner.
 * Retirement is terminal in this migration-state model; disaster recovery after
 * legacy removal belongs to deployment rollback, not pretending the old path is
 * still an available staged-rollout fallback.
 */
export function rollbackV3Rollout(input: {
  current: V3RolloutState;
  to: "legacy" | "shadow" | "limited";
  now: string;
}): V3RolloutState {
  validateState(input.current);
  const now = timestamp(input.now, "rollout.now");
  const entered = timestamp(input.current.enteredAt, "rollout.enteredAt");
  if (now.ms < entered.ms) {
    throw new Error("rollout.now cannot be before the current stage enteredAt.");
  }
  if (input.current.stage === "retired") {
    throw new Error(
      "Retired legacy cannot be restored through staged-rollout rollback.",
    );
  }
  if (STAGE_ORDER[input.to] >= STAGE_ORDER[input.current.stage]) {
    throw new Error("V3 rollback must move to a lower rollout stage.");
  }

  if (input.to === "legacy") {
    return {
      stage: "legacy",
      candidateSha: null,
      deploymentIdentityKey: null,
      enteredAt: now.value,
    };
  }
  if (input.current.stage === "legacy") {
    throw new Error("Legacy state has no active V3 deployment to roll back.");
  }

  return {
    stage: input.to,
    candidateSha: fullSha(input.current.candidateSha, "rollout.candidateSha"),
    deploymentIdentityKey: deploymentIdentityKey(
      input.current.deploymentIdentityKey,
      "rollout.deploymentIdentityKey",
    ),
    enteredAt: now.value,
  };
}

export function createV3LegacyRolloutState(enteredAt: string): V3RolloutState {
  const normalized = timestamp(enteredAt, "rollout.enteredAt");
  return {
    stage: "legacy",
    candidateSha: null,
    deploymentIdentityKey: null,
    enteredAt: normalized.value,
  };
}
