import { describe, expect, it } from "vitest";
import {
  evaluateV3OperationErrorBudget,
  V3_SLO_SCOPES,
  type V3OperationSuccessObservation,
} from "./v3-error-budget";
import type { V3SloEvidence } from "./v3-reliability-slo";
import {
  createV3StarterOperationObjective,
  evaluateV3CorrectnessSlo,
  evaluateV3StarterAvailabilityDecision,
  V3_STARTER_AVAILABILITY_POLICIES,
  V3_STARTER_LATENCY_GOALS,
} from "./v3-s10-slo-policy";

const SHA = "1111111111111111111111111111111111111111";

function evidence(overrides: Partial<V3SloEvidence> = {}): V3SloEvidence {
  return {
    source: "isolated_rehearsal",
    environment: "local-supabase",
    observedAt: "2026-10-20T06:00:00.000Z",
    commitSha: SHA,
    windowMinutes: 60,
    sampleCount: 1000,
    rationale: "Reviewed isolated baseline used to evaluate the canonical starter target.",
    ...overrides,
  };
}

function observation(
  scopeSuccesses: number,
  completedOperations = 1000,
): V3OperationSuccessObservation {
  return {
    generatedAt: "2026-10-20T07:00:00.000Z",
    environment: "local-supabase",
    commitSha: SHA,
    windowMinutes: 60,
    completedOperations,
    succeededOperations: scopeSuccesses,
  };
}

describe("System V3 S10 canonical starter SLO policy", () => {
  it("covers every fixed S10 workflow scope exactly once", () => {
    expect(Object.keys(V3_STARTER_AVAILABILITY_POLICIES).sort()).toEqual(
      [...V3_SLO_SCOPES].sort(),
    );
  });

  it("maps canonical Class A contest-critical workflows to the 99.9% starter target", () => {
    for (const scope of [
      "jury_submission",
      "televote_submission",
      "voting_round_transition",
      "results_lifecycle",
      "publication",
    ] as const) {
      expect(V3_STARTER_AVAILABILITY_POLICIES[scope]).toMatchObject({
        serviceClass: "contest_critical",
        targetSuccessRatio: 0.999,
        operationalWindow: "relevant_operational_window",
        activation: "requires_reviewed_evidence",
      });
    }
  });

  it("maps canonical Class B participation workflows to the 99.5% starter target", () => {
    for (const scope of [
      "confirmation_submission",
      "entry_mutation",
      "media_review_consequence",
    ] as const) {
      expect(V3_STARTER_AVAILABILITY_POLICIES[scope]).toMatchObject({
        serviceClass: "participation_critical",
        targetSuccessRatio: 0.995,
        operationalWindow: "defined_measurement_window",
        activation: "requires_reviewed_evidence",
      });
    }
  });

  it("does not invent numeric availability targets for supporting domains the plan leaves evidence-defined", () => {
    for (const scope of [
      "system",
      "notification_consequence",
      "projection_reconciliation",
    ] as const) {
      expect(V3_STARTER_AVAILABILITY_POLICIES[scope].targetSuccessRatio).toBeNull();
      expect(() =>
        createV3StarterOperationObjective({
          scope,
          evidence: evidence(),
          minimumCompletedOperations: 100,
        }),
      ).toThrow("reviewed evidence must define one");
    }
  });

  it("records the canonical starter p95 latency goals without claiming they are telemetry-certified", () => {
    expect(V3_STARTER_LATENCY_GOALS).toEqual({
      criticalCommandAcknowledgementP95Ms: 1500,
      commonCachedPublicProjectionP95Ms: 1000,
      activation: "requires_reviewed_telemetry",
    });
  });

  it("materializes a starter objective only with attached evidence and leaves validation to the canonical evaluator", () => {
    const objective = createV3StarterOperationObjective({
      scope: "jury_submission",
      evidence: evidence(),
      minimumCompletedOperations: 100,
    });
    expect(objective).toMatchObject({
      id: "v3-starter-jury_submission-availability-v1",
      scope: "jury_submission",
      targetSuccessRatio: 0.999,
      minimumCompletedOperations: 100,
    });
    expect(objective.evidence).toEqual(evidence());

    const valid = evaluateV3OperationErrorBudget(objective, observation(1000));
    expect(valid.status).toBe("within_budget");

    const invalidEvidenceObjective = createV3StarterOperationObjective({
      scope: "jury_submission",
      evidence: evidence({ rationale: "", commitSha: "not-a-sha" }),
      minimumCompletedOperations: 100,
    });
    const invalid = evaluateV3OperationErrorBudget(
      invalidEvidenceObjective,
      observation(1000),
    );
    expect(invalid.status).toBe("invalid_objective");
  });

  it("turns error-budget exhaustion into a reliability freeze instead of silently weakening the target", () => {
    const objective = createV3StarterOperationObjective({
      scope: "jury_submission",
      evidence: evidence(),
      minimumCompletedOperations: 100,
    });
    const evaluation = evaluateV3OperationErrorBudget(objective, observation(990));
    expect(evaluation.status).toBe("exhausted");

    const decision = evaluateV3StarterAvailabilityDecision(evaluation);
    expect(decision).toMatchObject({
      status: "reliability_freeze",
      scope: "jury_submission",
      certificationClaim: false,
      alert: {
        code: "operation_error_budget_exhausted",
        severity: "critical",
      },
    });
  });

  it("keeps insufficient and invalid evidence distinct from a genuine budget breach", () => {
    const objective = createV3StarterOperationObjective({
      scope: "confirmation_submission",
      evidence: evidence(),
      minimumCompletedOperations: 100,
    });
    const insufficient = evaluateV3OperationErrorBudget(
      objective,
      observation(20, 20),
    );
    expect(evaluateV3StarterAvailabilityDecision(insufficient).status).toBe(
      "insufficient_data",
    );

    const invalid = evaluateV3OperationErrorBudget(
      { ...objective, targetSuccessRatio: 2 },
      observation(1000),
    );
    expect(evaluateV3StarterAvailabilityDecision(invalid).status).toBe("invalid");
  });
});

describe("System V3 S10 correctness SLO", () => {
  it("keeps duplicate commits, silent lost successes and wrong-edition mutations at zero tolerance", () => {
    expect(
      evaluateV3CorrectnessSlo({
        duplicateCommittedOperations: 0,
        silentLostSuccessfulOperations: 0,
        wrongEditionOfficialMutations: 0,
      }),
    ).toEqual({
      schemaVersion: 1,
      status: "ok",
      alerts: [],
      validationErrors: [],
      incidentReviewRequired: false,
      certificationClaim: false,
    });
  });

  it("raises actionable critical alerts and requires incident review for every correctness breach", () => {
    const result = evaluateV3CorrectnessSlo({
      duplicateCommittedOperations: 1,
      silentLostSuccessfulOperations: 2,
      wrongEditionOfficialMutations: 3,
    });
    expect(result.status).toBe("critical");
    expect(result.incidentReviewRequired).toBe(true);
    expect(result.alerts.map((alert) => alert.code)).toEqual([
      "duplicate_canonical_operation",
      "silent_lost_successful_operation",
      "wrong_edition_official_mutation",
    ]);
    expect(result.alerts.every((alert) => alert.threshold === 0)).toBe(true);
    expect(result.alerts.every((alert) => alert.operatorAction.length > 20)).toBe(true);
  });

  it("fails closed on malformed correctness counters", () => {
    const result = evaluateV3CorrectnessSlo({
      duplicateCommittedOperations: -1,
      silentLostSuccessfulOperations: 0.5,
      wrongEditionOfficialMutations: Number.NaN,
    });
    expect(result.status).toBe("invalid");
    expect(result.alerts).toEqual([]);
    expect(result.validationErrors).toHaveLength(3);
    expect(result.incidentReviewRequired).toBe(false);
  });
});
