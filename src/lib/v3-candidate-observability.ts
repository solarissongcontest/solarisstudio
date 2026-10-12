import {
  createV3ObservabilityEvent,
  type V3ObservabilityEvaluation,
  type V3ObservabilityEvent,
  type V3RolloutEvidenceTarget,
  type V3RolloutStage,
} from "./v3-rollout-observability";

export type V3ObservationEnvironment = "preview" | "production";

/**
 * Stable identity of the deployed runtime candidate.
 *
 * This deliberately excludes rollout-policy revision. Changing cohort/edition
 * rollout scope must invalidate observability, but it must not pretend the code
 * deployment itself changed and force a circular restart at shadow.
 */
export type V3RuntimeDeploymentIdentity = {
  candidateSha: string;
  deploymentRef: string;
  schemaRevision: string;
  environment: V3ObservationEnvironment;
};

/**
 * Observation identity adds the authoritative rollout-policy revision to one
 * stable deployment identity. Policy changes therefore create a new telemetry
 * scope while preserving deployment identity for staged promotion continuity.
 */
export type V3RuntimeObservationIdentity = V3RuntimeDeploymentIdentity & {
  rolloutPolicyUpdatedAt: string;
};

export type V3CandidateObservabilityEvent = {
  candidateSha: string;
  deploymentIdentityKey: string;
  observationIdentityKey: string;
  event: V3ObservabilityEvent;
};

export type V3CandidateObservationScope = {
  candidateSha: string;
  runtimeIdentity: V3RuntimeObservationIdentity;
  deploymentIdentityKey: string;
  observationIdentityKey: string;
  target: V3RolloutEvidenceTarget;
  sourceStage: V3RolloutStage;
  windowStart: string;
  windowEnd: string;
};

export type V3CandidateObservabilityEvidence = {
  candidateSha: string;
  runtimeIdentity: V3RuntimeObservationIdentity;
  deploymentIdentityKey: string;
  observationIdentityKey: string;
  evidenceRef: string;
  observedAt: string;
  windowStart: string;
  windowEnd: string;
  sourceStage: V3RolloutStage;
  decision: V3ObservabilityEvaluation;
};

function fullSha(value: string, label: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${label} must be a full 40-character commit SHA.`);
  }
  return normalized;
}

function nonEmpty(value: string, label: string, maxLength = 160) {
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

function observationEnvironment(value: string): V3ObservationEnvironment {
  if (value !== "preview" && value !== "production") {
    throw new Error("environment must be preview or production.");
  }
  return value;
}

function lengthPrefixed(value: string) {
  return `${value.length}:${value}`;
}

export function normalizeV3RuntimeDeploymentIdentity(
  identity: V3RuntimeDeploymentIdentity,
): V3RuntimeDeploymentIdentity {
  return Object.freeze({
    candidateSha: fullSha(identity.candidateSha, "candidateSha"),
    deploymentRef: nonEmpty(identity.deploymentRef, "deploymentRef"),
    schemaRevision: nonEmpty(identity.schemaRevision, "schemaRevision", 128),
    environment: observationEnvironment(identity.environment),
  });
}

export function v3RuntimeDeploymentIdentityKey(
  identity: V3RuntimeDeploymentIdentity,
): string {
  const normalized = normalizeV3RuntimeDeploymentIdentity(identity);
  return [
    normalized.environment,
    normalized.candidateSha,
    normalized.deploymentRef,
    normalized.schemaRevision,
  ]
    .map(lengthPrefixed)
    .join("|");
}

export function normalizeV3RuntimeObservationIdentity(
  identity: V3RuntimeObservationIdentity,
): V3RuntimeObservationIdentity {
  const deployment = normalizeV3RuntimeDeploymentIdentity(identity);
  return Object.freeze({
    ...deployment,
    rolloutPolicyUpdatedAt: timestamp(
      identity.rolloutPolicyUpdatedAt,
      "rolloutPolicyUpdatedAt",
    ).value,
  });
}

export function v3RuntimeObservationIdentityKey(
  identity: V3RuntimeObservationIdentity,
): string {
  const normalized = normalizeV3RuntimeObservationIdentity(identity);
  const deploymentKey = v3RuntimeDeploymentIdentityKey(normalized);
  return [deploymentKey, normalized.rolloutPolicyUpdatedAt]
    .map(lengthPrefixed)
    .join("|");
}

export function sourceStageForV3ObservabilityTarget(
  target: V3RolloutEvidenceTarget,
): V3RolloutStage {
  switch (target) {
    case "limited":
      return "shadow";
    case "full":
      return "limited";
    case "retire_legacy":
      return "full";
  }
}

export function createV3CandidateObservationScope(input: {
  runtimeIdentity: V3RuntimeObservationIdentity;
  target: V3RolloutEvidenceTarget;
  windowStart: string;
  windowEnd: string;
}): V3CandidateObservationScope {
  const runtimeIdentity = normalizeV3RuntimeObservationIdentity(
    input.runtimeIdentity,
  );
  const start = timestamp(input.windowStart, "windowStart");
  const end = timestamp(input.windowEnd, "windowEnd");
  if (end.ms < start.ms) {
    throw new Error("windowEnd cannot be before windowStart.");
  }

  const rolloutRevision = timestamp(
    runtimeIdentity.rolloutPolicyUpdatedAt,
    "rolloutPolicyUpdatedAt",
  );
  if (start.ms < rolloutRevision.ms) {
    throw new Error(
      "Observation window cannot start before this rollout-policy revision became authoritative.",
    );
  }

  return Object.freeze({
    candidateSha: runtimeIdentity.candidateSha,
    runtimeIdentity,
    deploymentIdentityKey: v3RuntimeDeploymentIdentityKey(runtimeIdentity),
    observationIdentityKey: v3RuntimeObservationIdentityKey(runtimeIdentity),
    target: input.target,
    sourceStage: sourceStageForV3ObservabilityTarget(input.target),
    windowStart: start.value,
    windowEnd: end.value,
  });
}

/**
 * Adds deployment + observation identity around the existing low-cardinality
 * #499 event. Identity remains outside the event metadata contract so build and
 * rollout details do not become free-form product telemetry fields.
 */
export function createV3CandidateObservabilityEvent(input: {
  runtimeIdentity: V3RuntimeObservationIdentity;
  event: V3ObservabilityEvent;
}): V3CandidateObservabilityEvent {
  const runtimeIdentity = normalizeV3RuntimeObservationIdentity(
    input.runtimeIdentity,
  );
  return Object.freeze({
    candidateSha: runtimeIdentity.candidateSha,
    deploymentIdentityKey: v3RuntimeDeploymentIdentityKey(runtimeIdentity),
    observationIdentityKey: v3RuntimeObservationIdentityKey(runtimeIdentity),
    event: createV3ObservabilityEvent(input.event),
  });
}

export function assertV3CandidateEventInScope(
  scope: V3CandidateObservationScope,
  candidateEvent: V3CandidateObservabilityEvent,
): void {
  const scopeSha = fullSha(scope.candidateSha, "scope.candidateSha");
  const eventSha = fullSha(
    candidateEvent.candidateSha,
    "candidateEvent.candidateSha",
  );
  if (eventSha !== scopeSha) {
    throw new Error(
      `Observability event belongs to candidate ${eventSha}, not ${scopeSha}.`,
    );
  }

  const expectedDeploymentKey = v3RuntimeDeploymentIdentityKey(
    scope.runtimeIdentity,
  );
  const expectedObservationKey = v3RuntimeObservationIdentityKey(
    scope.runtimeIdentity,
  );
  if (scope.deploymentIdentityKey !== expectedDeploymentKey) {
    throw new Error(
      "Observation scope deployment identity key does not match its identity fields.",
    );
  }
  if (scope.observationIdentityKey !== expectedObservationKey) {
    throw new Error(
      "Observation scope observation identity key does not match its identity fields.",
    );
  }
  if (candidateEvent.deploymentIdentityKey !== expectedDeploymentKey) {
    throw new Error(
      "Observability event belongs to a different deployed runtime candidate.",
    );
  }
  if (candidateEvent.observationIdentityKey !== expectedObservationKey) {
    throw new Error(
      "Observability event belongs to a different rollout-policy observation scope.",
    );
  }

  const event = createV3ObservabilityEvent(candidateEvent.event);
  if (event.stage !== scope.sourceStage) {
    throw new Error(
      `Observability event stage ${event.stage} does not match required ${scope.sourceStage} evidence stage.`,
    );
  }

  const observed = timestamp(event.serverObservedAt, "event.serverObservedAt");
  const start = timestamp(scope.windowStart, "scope.windowStart");
  const end = timestamp(scope.windowEnd, "scope.windowEnd");
  if (observed.ms < start.ms || observed.ms > end.ms) {
    throw new Error("Observability event is outside the candidate evidence window.");
  }
}

export function assertV3CandidateEventsInScope(
  scope: V3CandidateObservationScope,
  events: readonly V3CandidateObservabilityEvent[],
): void {
  for (const event of events) assertV3CandidateEventInScope(scope, event);
}

/**
 * Certifies an already-evaluated #499 aggregate for one exact observation
 * scope. The aggregate query itself must use this scope. This function does not
 * query or aggregate telemetry and cannot substitute events from another
 * deployment, rollout-policy revision, stage or time window.
 */
export function createV3CandidateObservabilityEvidence(input: {
  scope: V3CandidateObservationScope;
  evaluation: V3ObservabilityEvaluation;
  aggregateRef: string;
  evaluatedAt: string;
}): V3CandidateObservabilityEvidence {
  const runtimeIdentity = normalizeV3RuntimeObservationIdentity(
    input.scope.runtimeIdentity,
  );
  const candidateSha = fullSha(
    input.scope.candidateSha,
    "scope.candidateSha",
  );
  if (candidateSha !== runtimeIdentity.candidateSha) {
    throw new Error(
      "Observation scope candidate SHA does not match its runtime identity.",
    );
  }

  const deploymentIdentityKey = v3RuntimeDeploymentIdentityKey(runtimeIdentity);
  const observationIdentityKey = v3RuntimeObservationIdentityKey(runtimeIdentity);
  if (input.scope.deploymentIdentityKey !== deploymentIdentityKey) {
    throw new Error(
      "Observation scope deployment identity key does not match its identity fields.",
    );
  }
  if (input.scope.observationIdentityKey !== observationIdentityKey) {
    throw new Error(
      "Observation scope observation identity key does not match its identity fields.",
    );
  }

  const expectedStage = sourceStageForV3ObservabilityTarget(input.scope.target);
  if (input.scope.sourceStage !== expectedStage) {
    throw new Error(
      `Observation scope sourceStage must be ${expectedStage} for ${input.scope.target} evidence.`,
    );
  }
  if (input.evaluation.target !== input.scope.target) {
    throw new Error(
      `Observability evaluation target ${input.evaluation.target} does not match scope target ${input.scope.target}.`,
    );
  }
  if (
    input.evaluation.ready !==
    input.evaluation.blockers.every((gate) => gate.passed)
  ) {
    throw new Error(
      "Observability evaluation readiness is inconsistent with its blockers.",
    );
  }

  const start = timestamp(input.scope.windowStart, "scope.windowStart");
  const end = timestamp(input.scope.windowEnd, "scope.windowEnd");
  if (end.ms < start.ms) {
    throw new Error("scope.windowEnd cannot be before scope.windowStart.");
  }
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  if (evaluatedAt.ms < end.ms) {
    throw new Error(
      "Candidate observability evidence cannot be evaluated before its window ends.",
    );
  }

  return Object.freeze({
    candidateSha,
    runtimeIdentity,
    deploymentIdentityKey,
    observationIdentityKey,
    evidenceRef: nonEmpty(input.aggregateRef, "aggregateRef"),
    observedAt: evaluatedAt.value,
    windowStart: start.value,
    windowEnd: end.value,
    sourceStage: input.scope.sourceStage,
    decision: input.evaluation,
  });
}

/**
 * Persistence integration requirement, not a database implementation.
 *
 * The current public UX telemetry allowlist predates these V3 event names and
 * runtime-scoping fields. A later additive schema/transport change must be
 * generated and rehearsed with isolated local Supabase before writes are wired.
 */
export const V3_CANDIDATE_OBSERVABILITY_TRANSPORT_REQUIREMENTS = Object.freeze({
  persistCandidateSha: true,
  persistDeploymentIdentityKey: true,
  persistObservationIdentityKey: true,
  persistServerObservedAt: true,
  aggregateByExactCandidateSha: true,
  aggregateByExactDeploymentIdentity: true,
  aggregateByExactObservationIdentity: true,
  aggregateByExactSourceStage: true,
  aggregateByBoundedServerWindow: true,
  currentPublicUxAllowlistReady: false,
});
