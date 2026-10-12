import { describe, expect, it } from "vitest";

import {
  assertV3CandidateEventsInScope,
  createV3CandidateObservationScope,
  createV3CandidateObservabilityEvidence,
  createV3CandidateObservabilityEvent,
  normalizeV3RuntimeDeploymentIdentity,
  normalizeV3RuntimeObservationIdentity,
  sourceStageForV3ObservabilityTarget,
  v3RuntimeDeploymentIdentityKey,
  v3RuntimeObservationIdentityKey,
  type V3RuntimeObservationIdentity,
} from "./v3-candidate-observability";
import {
  evaluateV3RolloutObservability,
  type V3ObservabilityAggregate,
  type V3ObservabilityEvent,
  type V3ObservabilityThresholds,
} from "./v3-rollout-observability";

const SHA = "1234567890abcdef1234567890abcdef12345678";
const OTHER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const IDENTITY: V3RuntimeObservationIdentity = {
  candidateSha: SHA,
  deploymentRef: "cloudflare:deployment-abc",
  schemaRevision: "20261011195500",
  rolloutPolicyUpdatedAt: "2026-10-12T04:00:00.000Z",
  environment: "production",
};

const thresholds: V3ObservabilityThresholds = {
  minExposedSessions: 2,
  minBootstrapAttempts: 2,
  minCriticalOperationSamples: 1,
  minFieldVitalSamples: 2,
  maxBootstrapFailureRate: 0.1,
  maxRuntimeErrorsPerSession: 0.1,
  maxLegacyFallbackRate: 0.1,
  maxPoorFieldVitalRate: 0.5,
};

const healthy: V3ObservabilityAggregate = {
  exposedSessions: 10,
  bootstrapAttempts: 10,
  bootstrapFailures: 0,
  runtimeErrors: 0,
  legacyFallbacks: 0,
  criticalOperationAttempts: 2,
  criticalOperationConfirmed: 2,
  criticalOperationRejected: 0,
  criticalOperationUncertain: 0,
  unresolvedUncertainOperations: 0,
  reconciliationAttempts: 0,
  reconciliationResolved: 0,
  fieldVitalSamples: 10,
  poorFieldVitalSamples: 0,
};

function event(
  stage: V3ObservabilityEvent["stage"],
  serverObservedAt = "2026-10-12T04:15:00.000Z",
  runtimeIdentity: V3RuntimeObservationIdentity = IDENTITY,
) {
  return createV3CandidateObservabilityEvent({
    runtimeIdentity,
    event: {
      name: "v3_exposure",
      stage,
      serverObservedAt,
      surface: "home",
      outcome: "ready",
      device: "mobile",
    },
  });
}

function scope(target: "limited" | "full" | "retire_legacy" = "limited") {
  return createV3CandidateObservationScope({
    runtimeIdentity: IDENTITY,
    target,
    windowStart: "2026-10-12T04:00:00.000Z",
    windowEnd: "2026-10-12T05:00:00.000Z",
  });
}

describe("Solaris Studio V3 candidate observability", () => {
  it("maps each promotion target to the stage that must have been observed", () => {
    expect(sourceStageForV3ObservabilityTarget("limited")).toBe("shadow");
    expect(sourceStageForV3ObservabilityTarget("full")).toBe("limited");
    expect(sourceStageForV3ObservabilityTarget("retire_legacy")).toBe("full");
  });

  it("normalizes deployment identity separately from rollout-policy observation identity", () => {
    const deployment = normalizeV3RuntimeDeploymentIdentity({
      ...IDENTITY,
      candidateSha: SHA.toUpperCase(),
      deploymentRef: "  cloudflare:deployment-abc  ",
    });
    expect(deployment).toEqual({
      candidateSha: SHA,
      deploymentRef: "cloudflare:deployment-abc",
      schemaRevision: "20261011195500",
      environment: "production",
    });

    const observation = normalizeV3RuntimeObservationIdentity(IDENTITY);
    expect(observation.rolloutPolicyUpdatedAt).toBe(
      "2026-10-12T04:00:00.000Z",
    );
  });

  it("keeps deployment identity stable when only rollout policy changes", () => {
    const changedPolicy = {
      ...IDENTITY,
      rolloutPolicyUpdatedAt: "2026-10-12T04:30:00.000Z",
    };

    expect(v3RuntimeDeploymentIdentityKey(changedPolicy)).toBe(
      v3RuntimeDeploymentIdentityKey(IDENTITY),
    );
    expect(v3RuntimeObservationIdentityKey(changedPolicy)).not.toBe(
      v3RuntimeObservationIdentityKey(IDENTITY),
    );
  });

  it("changes deployment identity for code/deployment/schema/environment changes", () => {
    const baseKey = v3RuntimeDeploymentIdentityKey(IDENTITY);
    expect(
      v3RuntimeDeploymentIdentityKey({
        ...IDENTITY,
        candidateSha: OTHER_SHA,
      }),
    ).not.toBe(baseKey);
    expect(
      v3RuntimeDeploymentIdentityKey({
        ...IDENTITY,
        deploymentRef: "cloudflare:deployment-new",
      }),
    ).not.toBe(baseKey);
    expect(
      v3RuntimeDeploymentIdentityKey({
        ...IDENTITY,
        schemaRevision: "20261012000100",
      }),
    ).not.toBe(baseKey);
    expect(
      v3RuntimeDeploymentIdentityKey({
        ...IDENTITY,
        environment: "preview",
      }),
    ).not.toBe(baseKey);
  });

  it("creates exact deployment and observation keys in the observation scope", () => {
    const result = scope("full");
    expect(result.candidateSha).toBe(SHA);
    expect(result.sourceStage).toBe("limited");
    expect(result.deploymentIdentityKey).toBe(
      v3RuntimeDeploymentIdentityKey(IDENTITY),
    );
    expect(result.observationIdentityKey).toBe(
      v3RuntimeObservationIdentityKey(IDENTITY),
    );
  });

  it("does not allow an evidence window to begin before this rollout-policy revision", () => {
    expect(() =>
      createV3CandidateObservationScope({
        runtimeIdentity: IDENTITY,
        target: "limited",
        windowStart: "2026-10-12T03:59:59.999Z",
        windowEnd: "2026-10-12T05:00:00.000Z",
      }),
    ).toThrow(/rollout-policy revision became authoritative/);
  });

  it("uses the parent #499 event validator while adding both identity layers", () => {
    const wrapped = event("shadow");
    expect(wrapped.candidateSha).toBe(SHA);
    expect(wrapped.deploymentIdentityKey).toBe(
      v3RuntimeDeploymentIdentityKey(IDENTITY),
    );
    expect(wrapped.observationIdentityKey).toBe(
      v3RuntimeObservationIdentityKey(IDENTITY),
    );
    expect(wrapped.event.name).toBe("v3_exposure");
  });

  it("accepts only events from the exact deployment, policy scope, stage and window", () => {
    expect(() =>
      assertV3CandidateEventsInScope(scope(), [
        event("shadow", "2026-10-12T04:00:00.000Z"),
        event("shadow", "2026-10-12T04:30:00.000Z"),
        event("shadow", "2026-10-12T05:00:00.000Z"),
      ]),
    ).not.toThrow();
  });

  it("rejects another candidate/deployment while distinguishing policy-only changes", () => {
    expect(() =>
      assertV3CandidateEventsInScope(scope(), [
        event("shadow", undefined, { ...IDENTITY, candidateSha: OTHER_SHA }),
      ]),
    ).toThrow(/belongs to candidate/);

    expect(() =>
      assertV3CandidateEventsInScope(scope(), [
        event("shadow", undefined, {
          ...IDENTITY,
          deploymentRef: "cloudflare:deployment-other",
        }),
      ]),
    ).toThrow(/different deployed runtime candidate/);

    expect(() =>
      assertV3CandidateEventsInScope(scope(), [
        event("shadow", "2026-10-12T04:45:00.000Z", {
          ...IDENTITY,
          rolloutPolicyUpdatedAt: "2026-10-12T04:30:00.000Z",
        }),
      ]),
    ).toThrow(/different rollout-policy observation scope/);
  });

  it("rejects events from the wrong rollout stage or outside the window", () => {
    expect(() =>
      assertV3CandidateEventsInScope(scope("full"), [event("shadow")]),
    ).toThrow(/does not match required limited evidence stage/);

    expect(() =>
      assertV3CandidateEventsInScope(scope(), [
        event("shadow", "2026-10-12T05:00:00.001Z"),
      ]),
    ).toThrow(/outside the candidate evidence window/);
  });

  it("certifies a healthy #499 evaluation with both identity layers", () => {
    const evaluation = evaluateV3RolloutObservability(
      "full",
      healthy,
      thresholds,
    );
    const certificate = createV3CandidateObservabilityEvidence({
      scope: scope("full"),
      evaluation,
      aggregateRef: "public-ux-aggregate:deployment-abc:policy-1:window-4-5",
      evaluatedAt: "2026-10-12T05:00:01.000Z",
    });

    expect(certificate.candidateSha).toBe(SHA);
    expect(certificate.deploymentIdentityKey).toBe(
      v3RuntimeDeploymentIdentityKey(IDENTITY),
    );
    expect(certificate.observationIdentityKey).toBe(
      v3RuntimeObservationIdentityKey(IDENTITY),
    );
    expect(certificate.sourceStage).toBe("limited");
    expect(certificate.decision).toBe(evaluation);
  });

  it("refuses wrong-target or premature aggregate certification", () => {
    expect(() =>
      createV3CandidateObservabilityEvidence({
        scope: scope("full"),
        evaluation: evaluateV3RolloutObservability(
          "limited",
          healthy,
          thresholds,
        ),
        aggregateRef: "aggregate:wrong-target",
        evaluatedAt: "2026-10-12T05:01:00.000Z",
      }),
    ).toThrow(/does not match scope target/);

    expect(() =>
      createV3CandidateObservabilityEvidence({
        scope: scope(),
        evaluation: evaluateV3RolloutObservability(
          "limited",
          healthy,
          thresholds,
        ),
        aggregateRef: "aggregate:too-early",
        evaluatedAt: "2026-10-12T04:59:59.999Z",
      }),
    ).toThrow(/before its window ends/);
  });

  it("rejects malformed identity and empty evidence references", () => {
    expect(() =>
      normalizeV3RuntimeDeploymentIdentity({
        ...IDENTITY,
        candidateSha: "abc123",
      }),
    ).toThrow(/full 40-character commit SHA/);
    expect(() =>
      normalizeV3RuntimeObservationIdentity({
        ...IDENTITY,
        environment: "prod-ish" as "production",
      }),
    ).toThrow(/environment must be preview or production/);

    expect(() =>
      createV3CandidateObservabilityEvidence({
        scope: scope(),
        evaluation: evaluateV3RolloutObservability(
          "limited",
          healthy,
          thresholds,
        ),
        aggregateRef: "   ",
        evaluatedAt: "2026-10-12T05:01:00.000Z",
      }),
    ).toThrow(/aggregateRef must not be empty/);
  });
});
