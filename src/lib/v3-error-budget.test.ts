import { describe, expect, it } from "vitest";
import {
  evaluateV3OperationErrorBudget,
  V3_SLO_SCOPES,
  type V3OperationSuccessObjective,
  type V3OperationSuccessObservation,
} from "./v3-error-budget";

const BASELINE_SHA = "1111111111111111111111111111111111111111";
const OBSERVATION_SHA = "2222222222222222222222222222222222222222";

function objective(
  overrides: Partial<V3OperationSuccessObjective> = {},
): V3OperationSuccessObjective {
  return {
    schemaVersion: 1,
    id: "measured-operation-success-v1",
    scope: "system",
    indicator: "successful_operation_ratio",
    targetSuccessRatio: 0.99,
    minimumCompletedOperations: 100,
    evidence: {
      source: "isolated_rehearsal",
      environment: "local-supabase",
      observedAt: "2026-10-17T13:00:00.000Z",
      commitSha: BASELINE_SHA,
      windowMinutes: 60,
      sampleCount: 1000,
      rationale: "Fixture target justified from reviewed bounded baseline evidence.",
    },
    ...overrides,
  };
}

function observation(
  overrides: Partial<V3OperationSuccessObservation> = {},
): V3OperationSuccessObservation {
  return {
    generatedAt: "2026-10-17T14:00:00.000Z",
    environment: "isolated-test",
    commitSha: OBSERVATION_SHA,
    windowMinutes: 60,
    completedOperations: 1000,
    succeededOperations: 995,
    ...overrides,
  };
}

describe("System V3 S10 evidence-backed error budget", () => {
  it("uses a fixed low-cardinality scope inventory for critical Solaris workflows", () => {
    expect(V3_SLO_SCOPES).toEqual([
      "system",
      "confirmation_submission",
      "entry_mutation",
      "media_review_consequence",
      "jury_submission",
      "televote_submission",
      "voting_round_transition",
      "results_lifecycle",
      "publication",
      "notification_consequence",
      "projection_reconciliation",
    ]);
  });

  it("measures remaining budget from explicit target evidence without inventing a target", () => {
    const result = evaluateV3OperationErrorBudget(objective(), observation());
    expect(result.status).toBe("within_budget");
    expect(result.budget.allowedBadOperations).toBeCloseTo(10);
    expect(result.budget.consumedBadOperations).toBe(5);
    expect(result.budget.remainingBadOperations).toBeCloseTo(5);
    expect(result.budget.overspentBadOperations).toBe(0);
    expect(result.budget.consumedRatio).toBeCloseTo(0.5);
    expect(result.budget.burnRate).toBeCloseTo(0.5);
    expect(result.certificationClaim).toBe(false);
  });

  it("marks the budget exhausted when observed unsuccessful completions exceed allowance", () => {
    const result = evaluateV3OperationErrorBudget(
      objective(),
      observation({ succeededOperations: 980 }),
    );
    expect(result.status).toBe("exhausted");
    expect(result.budget.consumedBadOperations).toBe(20);
    expect(result.budget.remainingBadOperations).toBe(0);
    expect(result.budget.overspentBadOperations).toBeCloseTo(10);
    expect(result.budget.burnRate).toBeCloseTo(2);
  });

  it("treats a 100% objective as zero error budget without emitting infinity", () => {
    const clean = evaluateV3OperationErrorBudget(
      objective({ targetSuccessRatio: 1 }),
      observation({ succeededOperations: 1000 }),
    );
    expect(clean.status).toBe("within_budget");
    expect(clean.budget.allowedBadOperations).toBe(0);
    expect(clean.budget.consumedRatio).toBe(0);
    expect(clean.budget.burnRate).toBe(0);

    const breached = evaluateV3OperationErrorBudget(
      objective({ targetSuccessRatio: 1 }),
      observation({ succeededOperations: 999 }),
    );
    expect(breached.status).toBe("exhausted");
    expect(breached.budget.consumedRatio).toBeNull();
    expect(breached.budget.burnRate).toBeNull();
    expect(JSON.stringify(breached)).not.toContain("Infinity");
  });


  it("does not falsely exhaust an exact decimal budget at its integer boundary", () => {
    const exact = evaluateV3OperationErrorBudget(
      objective({
        targetSuccessRatio: 0.9995,
        minimumCompletedOperations: 2000,
        evidence: { ...objective().evidence, sampleCount: 2000 },
      }),
      observation({ completedOperations: 2000, succeededOperations: 1999 }),
    );
    expect(exact.status).toBe("within_budget");
    expect(exact.budget.allowedBadOperations).toBe(1);
    expect(exact.budget.remainingBadOperations).toBe(0);
    expect(exact.budget.consumedRatio).toBe(1);
    expect(exact.budget.burnRate).toBe(1);

    const exhausted = evaluateV3OperationErrorBudget(
      objective({
        targetSuccessRatio: 0.9995,
        minimumCompletedOperations: 2000,
        evidence: { ...objective().evidence, sampleCount: 2000 },
      }),
      observation({ completedOperations: 2000, succeededOperations: 1998 }),
    );
    expect(exhausted.status).toBe("exhausted");
    expect(exhausted.budget.overspentBadOperations).toBe(1);
  });

  it("does not round a genuinely stricter target up to forgive a bad operation", () => {
    const result = evaluateV3OperationErrorBudget(
      objective({
        targetSuccessRatio: 0.9995000000000001,
        minimumCompletedOperations: 2000,
        evidence: { ...objective().evidence, sampleCount: 2000 },
      }),
      observation({ completedOperations: 2000, succeededOperations: 1999 }),
    );
    expect(result.status).toBe("exhausted");
    expect(result.budget.allowedBadOperations).toBeLessThan(1);
  });

  it("honours a mathematically exact ten-failure boundary without binary rounding", () => {
    const result = evaluateV3OperationErrorBudget(
      objective({ targetSuccessRatio: 0.9 }),
      observation({ completedOperations: 100, succeededOperations: 90 }),
    );
    expect(result.status).toBe("within_budget");
    expect(result.budget.allowedBadOperations).toBe(10);
    expect(result.budget.consumedRatio).toBe(1);
  });

  it("rejects unsafe integer operation counts and objective evidence totals", () => {
    const tooMany = Number.MAX_SAFE_INTEGER + 1;
    expect(
      evaluateV3OperationErrorBudget(objective(), observation({
        completedOperations: tooMany,
        succeededOperations: tooMany,
      })).status,
    ).toBe("invalid_observation");
    expect(
      evaluateV3OperationErrorBudget(
        objective({ evidence: { ...objective().evidence, sampleCount: tooMany } }),
        observation(),
      ).status,
    ).toBe("invalid_objective");
  });

  it("returns insufficient_data below the evidence-backed sample floor", () => {
    const result = evaluateV3OperationErrorBudget(
      objective({ minimumCompletedOperations: 100 }),
      observation({ completedOperations: 25, succeededOperations: 20 }),
    );
    expect(result.status).toBe("insufficient_data");
  });

  it("rejects objectives without trustworthy target evidence", () => {
    const result = evaluateV3OperationErrorBudget(
      objective({
        targetSuccessRatio: 1.2,
        evidence: {
          ...objective().evidence,
          source: "unsupported-source" as never,
          commitSha: "not-a-sha",
          rationale: "",
          sampleCount: 10,
        },
      }),
      observation(),
    );
    expect(result.status).toBe("invalid_objective");
    expect(result.validationErrors).toContain(
      "targetSuccessRatio must be greater than 0 and at most 1",
    );
    expect(result.validationErrors).toContain("objective evidence source is unsupported");
    expect(result.validationErrors).toContain("objective evidence rationale is required");
    expect(result.validationErrors).toContain(
      "objective evidence commitSha must be an exact 40-character SHA",
    );
    expect(result.validationErrors).toContain(
      "objective evidence sampleCount must cover minimumCompletedOperations",
    );
  });

  it("rejects impossible observations rather than normalizing them into healthy evidence", () => {
    const result = evaluateV3OperationErrorBudget(
      objective(),
      observation({ completedOperations: 10, succeededOperations: 11 }),
    );
    expect(result.status).toBe("invalid_observation");
    expect(result.validationErrors).toContain(
      "succeededOperations cannot exceed completedOperations",
    );
  });
});
