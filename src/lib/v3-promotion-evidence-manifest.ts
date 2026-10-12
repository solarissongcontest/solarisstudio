import type { V3CriticalWorkflow } from "./v3-workflow-cutover-gate";
import {
  evaluateV3ReleaseCandidateEvidence,
  type V3CandidateVerificationEvidence,
  type V3CandidateWorkflowDecisionEvidence,
  type V3ReleaseCandidateDecision,
} from "./v3-release-candidate-evidence";
import {
  applyV3ObservedRolloutPromotion,
  type V3ObservedPromotionApplyResult,
  type V3ObservedPromotionStage,
  type V3ObservedPromotionTarget,
  type V3PromotionObservationEvidence,
} from "./v3-promotion-observation-epoch";
import type { V3RolloutPromotionPolicy } from "./v3-rollout-promotion-sequence";
import type { V3RolloutStateLedger } from "./v3-rollout-state-ledger";

export type V3PromotionEvidenceManifest = {
  manifestVersion: 1;
  manifestRef: string;
  assembledAt: string;
  candidateSha: string;
  target: V3ObservedPromotionTarget;
  workflows: readonly V3CriticalWorkflow[];
  verification: readonly V3CandidateVerificationEvidence[];
  workflowDecisions: readonly V3CandidateWorkflowDecisionEvidence[];
  observation: V3PromotionObservationEvidence;
};

export type V3PromotionManifestEvaluation = {
  manifestRef: string;
  assembledAt: string;
  releaseDecision: V3ReleaseCandidateDecision;
};

function nonEmpty(value: string, label: string, maxLength = 512) {
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

function targetForPromotion(to: V3ObservedPromotionStage): V3ObservedPromotionTarget {
  return to === "retired" ? "retire_legacy" : to;
}

/**
 * Recomputes #505 release eligibility from the manifest's actual component
 * evidence. The manifest reference is audit metadata only; it is never trusted
 * as proof that a candidate passed verification or workflow safety.
 */
export function evaluateV3PromotionEvidenceManifest(input: {
  manifest: V3PromotionEvidenceManifest;
  to: V3ObservedPromotionStage;
}): V3PromotionManifestEvaluation {
  if (input.manifest.manifestVersion !== 1) {
    throw new Error("Unsupported V3 promotion evidence manifest version.");
  }

  const manifestRef = nonEmpty(input.manifest.manifestRef, "manifestRef");
  const assembledAt = timestamp(input.manifest.assembledAt, "assembledAt");
  const expectedTarget = targetForPromotion(input.to);
  if (input.manifest.target !== expectedTarget) {
    throw new Error(
      `Promotion evidence manifest targets ${input.manifest.target}, not ${expectedTarget}.`,
    );
  }

  for (const evidence of input.manifest.verification) {
    const observed = timestamp(
      evidence.observedAt,
      `verification.${evidence.gate}.observedAt`,
    );
    if (observed.ms > assembledAt.ms) {
      throw new Error(
        `Promotion manifest was assembled before ${evidence.gate} verification evidence existed.`,
      );
    }
  }

  for (const evidence of input.manifest.workflowDecisions) {
    const observed = timestamp(
      evidence.observedAt,
      `workflow.${evidence.decision.workflow}.observedAt`,
    );
    if (observed.ms > assembledAt.ms) {
      throw new Error(
        `Promotion manifest was assembled before ${evidence.decision.workflow} workflow evidence existed.`,
      );
    }
  }

  const observationObservedAt = timestamp(
    input.manifest.observation.observedAt,
    "observation.observedAt",
  );
  if (observationObservedAt.ms > assembledAt.ms) {
    throw new Error(
      "Promotion manifest was assembled before its observability evidence existed.",
    );
  }

  const releaseDecision = evaluateV3ReleaseCandidateEvidence({
    candidateSha: input.manifest.candidateSha,
    target: input.manifest.target,
    workflows: input.manifest.workflows,
    verification: input.manifest.verification,
    workflowDecisions: input.manifest.workflowDecisions,
    observability: input.manifest.observation,
  });

  return {
    manifestRef,
    assembledAt: assembledAt.value,
    releaseDecision,
  };
}

/**
 * Applies a limited/full/retirement promotion without accepting a detached
 * caller-supplied release decision.
 *
 * The decision is always derived from the exact verification, workflow and
 * observability evidence stored in the manifest, then passed into #511's
 * current-stage-epoch promotion wrapper. A durable manifest reference is kept
 * only for audit lookup and can never turn blocked evidence into a pass.
 */
export function applyV3PromotionEvidenceManifest(input: {
  current: V3RolloutStateLedger;
  expectedRevision: number;
  to: V3ObservedPromotionStage;
  manifest: V3PromotionEvidenceManifest;
  runtimeIdentityKey: string;
  policy: V3RolloutPromotionPolicy;
  serverTime: string;
}): V3ObservedPromotionApplyResult {
  const evaluated = evaluateV3PromotionEvidenceManifest({
    manifest: input.manifest,
    to: input.to,
  });
  const serverTime = timestamp(input.serverTime, "serverTime");
  const assembledAt = timestamp(evaluated.assembledAt, "assembledAt");
  if (assembledAt.ms > serverTime.ms) {
    throw new Error("Promotion manifest cannot be assembled after promotion server time.");
  }

  return applyV3ObservedRolloutPromotion({
    current: input.current,
    expectedRevision: input.expectedRevision,
    to: input.to,
    releaseEvidence: evaluated.releaseDecision,
    releaseEvidenceRef: evaluated.manifestRef,
    observation: input.manifest.observation,
    runtimeIdentityKey: input.runtimeIdentityKey,
    policy: input.policy,
    serverTime: serverTime.value,
  });
}
