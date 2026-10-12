import type { V3ReleaseCandidateDecision } from "./v3-release-candidate-evidence";
import {
  applyV3RolloutPromotion,
  type V3RolloutPromotionApplyResult,
  type V3RolloutStateLedger,
} from "./v3-rollout-state-ledger";
import type { V3RolloutPromotionPolicy } from "./v3-rollout-promotion-sequence";

export type V3ObservedPromotionStage = "limited" | "full" | "retired";
export type V3ObservedPromotionTarget = "limited" | "full" | "retire_legacy";
export type V3ObservedSourceStage = "shadow" | "limited" | "full";

/**
 * Structural subset of the runtime-bound observability certificate from #508.
 * Deployment identity proves which code/deployment/schema is running, while
 * observation identity additionally scopes the rollout-policy revision.
 */
export type V3PromotionObservationEvidence = {
  candidateSha: string;
  deploymentIdentityKey: string;
  observationIdentityKey: string;
  evidenceRef: string;
  observedAt: string;
  windowStart: string;
  windowEnd: string;
  sourceStage: V3ObservedSourceStage;
  decision: {
    target: V3ObservedPromotionTarget;
    ready: boolean;
    blockers: readonly { id: string; passed: boolean }[];
  };
};

export type V3PromotionObservationBlocker = {
  id: string;
  reason: string;
};

export type V3PromotionObservationDecision = {
  allowed: boolean;
  blockers: readonly V3PromotionObservationBlocker[];
};

export type V3ObservedPromotionApplyResult =
  | V3RolloutPromotionApplyResult
  | {
      status: "observation_blocked";
      record: V3RolloutStateLedger;
      promotionDecision: Extract<
        V3RolloutPromotionApplyResult,
        { status: "applied" }
      >["decision"];
      observationDecision: V3PromotionObservationDecision;
    };

function fullSha(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return normalized;
}

function nonEmpty(value: string, label: string, maxLength = 1024) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized.length > maxLength) {
    throw new Error(`${label} must not exceed ${maxLength} characters.`);
  }
  return normalized;
}

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  const ms = Date.parse(normalized);
  if (!normalized || Number.isNaN(ms)) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return { value: normalized, ms };
}

function expectedSourceStage(to: V3ObservedPromotionStage): V3ObservedSourceStage {
  switch (to) {
    case "limited":
      return "shadow";
    case "full":
      return "limited";
    case "retired":
      return "full";
  }
}

function expectedTarget(to: V3ObservedPromotionStage): V3ObservedPromotionTarget {
  return to === "retired" ? "retire_legacy" : to;
}

function lengthPrefixed(value: string) {
  return `${value.length}:${value}`;
}

export function createV3PromotionEvidenceBundleRef(input: {
  releaseEvidenceRef: string;
  observationEvidenceRef: string;
}) {
  const release = nonEmpty(input.releaseEvidenceRef, "releaseEvidenceRef", 512);
  const observation = nonEmpty(
    input.observationEvidenceRef,
    "observationEvidenceRef",
    512,
  );
  return `v3-promotion-evidence|${lengthPrefixed(release)}|${lengthPrefixed(observation)}`;
}

/**
 * Ensures observability belongs to the exact persisted rollout epoch.
 *
 * Deployment identity alone is not sufficient. A rollback, stage transition or
 * same-stage observation-epoch reset changes `state.enteredAt`; telemetry from
 * before that timestamp cannot be reused even when the deployment is unchanged.
 */
export function evaluateV3PromotionObservationEpoch(input: {
  current: V3RolloutStateLedger;
  to: V3ObservedPromotionStage;
  observation: V3PromotionObservationEvidence;
  serverTime: string;
}): V3PromotionObservationDecision {
  const blockers: V3PromotionObservationBlocker[] = [];
  const expectedSource = expectedSourceStage(input.to);
  const target = expectedTarget(input.to);
  const serverTime = timestamp(input.serverTime, "serverTime");
  const enteredAt = timestamp(
    input.current.state.enteredAt,
    "ledger.state.enteredAt",
  );

  if (input.current.state.stage !== expectedSource) {
    blockers.push({
      id: "wrong_current_stage",
      reason: `Promotion to ${input.to} requires current stage ${expectedSource}.`,
    });
  }

  if (input.current.state.stage === "legacy") {
    blockers.push({
      id: "missing_active_deployment",
      reason: "Legacy state has no active V3 deployment observation epoch.",
    });
  } else {
    const ledgerSha = fullSha(
      input.current.state.candidateSha,
      "ledger.state.candidateSha",
    );
    const evidenceSha = fullSha(
      input.observation.candidateSha,
      "observation.candidateSha",
    );
    if (ledgerSha !== evidenceSha) {
      blockers.push({
        id: "candidate_mismatch",
        reason: "Observability evidence belongs to another candidate SHA.",
      });
    }

    const ledgerDeployment = nonEmpty(
      input.current.state.deploymentIdentityKey,
      "ledger.state.deploymentIdentityKey",
    );
    const evidenceDeployment = nonEmpty(
      input.observation.deploymentIdentityKey,
      "observation.deploymentIdentityKey",
    );
    if (ledgerDeployment !== evidenceDeployment) {
      blockers.push({
        id: "deployment_mismatch",
        reason:
          "Observability evidence belongs to another deployed code/schema candidate.",
      });
    }
  }

  nonEmpty(
    input.observation.observationIdentityKey,
    "observation.observationIdentityKey",
  );
  nonEmpty(input.observation.evidenceRef, "observation.evidenceRef", 512);

  if (input.observation.sourceStage !== expectedSource) {
    blockers.push({
      id: "wrong_source_stage",
      reason: `Observability source stage must be ${expectedSource} for ${input.to} promotion.`,
    });
  }
  if (input.observation.decision.target !== target) {
    blockers.push({
      id: "wrong_observation_target",
      reason: `Observability decision targets ${input.observation.decision.target}, not ${target}.`,
    });
  }
  if (!input.observation.decision.ready) {
    blockers.push({
      id: "observation_not_ready",
      reason:
        input.observation.decision.blockers
          .filter((item) => !item.passed)
          .map((item) => item.id)
          .join(", ") || "Observability evidence is not ready.",
    });
  } else if (input.observation.decision.blockers.some((item) => !item.passed)) {
    blockers.push({
      id: "observation_inconsistent",
      reason:
        "Observability is marked ready while unresolved blocker evidence remains.",
    });
  }

  const windowStart = timestamp(
    input.observation.windowStart,
    "observation.windowStart",
  );
  const windowEnd = timestamp(
    input.observation.windowEnd,
    "observation.windowEnd",
  );
  const observedAt = timestamp(
    input.observation.observedAt,
    "observation.observedAt",
  );

  if (windowEnd.ms < windowStart.ms) {
    throw new Error("observation.windowEnd cannot be before windowStart.");
  }
  if (observedAt.ms < windowEnd.ms) {
    throw new Error(
      "observation.observedAt cannot be before its observation window ends.",
    );
  }
  if (serverTime.ms < enteredAt.ms) {
    throw new Error("serverTime cannot be before the current rollout epoch.");
  }

  if (windowStart.ms < enteredAt.ms) {
    blockers.push({
      id: "window_predates_stage_epoch",
      reason:
        "Observability window begins before the currently persisted rollout stage/observation epoch.",
    });
  }
  if (windowEnd.ms > serverTime.ms) {
    blockers.push({
      id: "window_ends_in_future",
      reason: "Observability window ends after the promotion server time.",
    });
  }
  if (observedAt.ms > serverTime.ms) {
    blockers.push({
      id: "evidence_observed_in_future",
      reason: "Observability evidence was recorded after the promotion server time.",
    });
  }

  return { allowed: blockers.length === 0, blockers };
}

/**
 * Reference transaction composition for limited/full/retirement promotion.
 *
 * #509 remains the authoritative rollout-ledger transition. This wrapper first
 * lets #509 validate/simulate the requested transition, then refuses to return
 * that applied transition unless the #508-compatible certificate belongs to the
 * exact current persisted stage/observation epoch.
 */
export function applyV3ObservedRolloutPromotion(input: {
  current: V3RolloutStateLedger;
  expectedRevision: number;
  to: V3ObservedPromotionStage;
  releaseEvidence: V3ReleaseCandidateDecision;
  releaseEvidenceRef: string;
  observation: V3PromotionObservationEvidence;
  deploymentIdentityKey: string;
  policy: V3RolloutPromotionPolicy;
  serverTime: string;
}): V3ObservedPromotionApplyResult {
  const promotionEvidenceRef = createV3PromotionEvidenceBundleRef({
    releaseEvidenceRef: input.releaseEvidenceRef,
    observationEvidenceRef: input.observation.evidenceRef,
  });

  const base = applyV3RolloutPromotion({
    current: input.current,
    expectedRevision: input.expectedRevision,
    to: input.to,
    evidence: input.releaseEvidence,
    deploymentIdentityKey: input.deploymentIdentityKey,
    policy: input.policy,
    evidenceRef: promotionEvidenceRef,
    serverTime: input.serverTime,
  });

  if (base.status !== "applied") return base;

  const observationDecision = evaluateV3PromotionObservationEpoch({
    current: input.current,
    to: input.to,
    observation: input.observation,
    serverTime: input.serverTime,
  });
  if (!observationDecision.allowed) {
    return {
      status: "observation_blocked",
      record: input.current,
      promotionDecision: base.decision,
      observationDecision,
    };
  }

  return base;
}
