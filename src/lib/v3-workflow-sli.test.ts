import { describe, expect, it } from "vitest";
import { V3_SLO_SCOPES } from "./v3-error-budget";
import {
  V3_UNINSTRUMENTED_OPERATION_SLI_SCOPES,
  V3_WORKFLOW_SLI_SCOPES,
  workflowOperationObservation,
  type V3WorkflowSliMetric,
  type V3WorkflowSliSnapshot,
} from "./v3-workflow-sli";

const SHA = "1111111111111111111111111111111111111111";

function metric(overrides: Partial<V3WorkflowSliMetric> = {}): V3WorkflowSliMetric {
  return {
    scope: "confirmation_submission",
    totalOperations: 100,
    completedOperations: 95,
    succeededOperations: 92,
    failedOperations: 2,
    uncertainOperations: 1,
    processingOperations: 5,
    reconciliationPendingOperations: 6,
    successRatio: 0.9684,
    operationLatencySamples: 90,
    p50OperationLatencyMs: 120,
    p95OperationLatencyMs: 420,
    p99OperationLatencyMs: 700,
    consequenceCount: 120,
    completedConsequenceCount: 117,
    unresolvedConsequenceCount: 3,
    p95ConsequenceLagMs: 350,
    ...overrides,
  };
}

function snapshot(workflows: readonly V3WorkflowSliMetric[]): V3WorkflowSliSnapshot {
  return {
    schemaVersion: 3,
    generatedAt: "2026-10-20T06:00:00.000Z",
    windowMinutes: 60,
    workflows,
  };
}

describe("System V3 workflow SLI evidence adapter", () => {
  it("exposes only SLO scopes backed by a canonical operation-receipt producer", () => {
    expect(V3_WORKFLOW_SLI_SCOPES).toEqual(
      V3_SLO_SCOPES.filter(
        (scope) => scope !== "system" && scope !== "projection_reconciliation",
      ),
    );
    expect(V3_UNINSTRUMENTED_OPERATION_SLI_SCOPES).toEqual([
      "projection_reconciliation",
    ]);
  });

  it("maps only server-aggregated workflow evidence into the canonical error-budget observation", () => {
    expect(
      workflowOperationObservation(
        snapshot([metric()]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      ),
    ).toEqual({
      generatedAt: "2026-10-20T06:00:00.000Z",
      environment: "local-supabase",
      commitSha: SHA,
      windowMinutes: 60,
      completedOperations: 95,
      succeededOperations: 92,
    });
  });

  it("fails closed when a workflow row is missing or duplicated", () => {
    expect(() =>
      workflowOperationObservation(
        snapshot([]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("Expected exactly one workflow SLI row");

    expect(() =>
      workflowOperationObservation(
        snapshot([metric(), metric()]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("received 2");
  });

  it("rejects incoherent counters rather than laundering them into healthy evidence", () => {
    expect(() =>
      workflowOperationObservation(
        snapshot([
          metric({
            completedOperations: 95,
            succeededOperations: 94,
            failedOperations: 2,
            uncertainOperations: 1,
          }),
        ]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("completedOperations must equal succeeded + failed + uncertain operations");

    expect(() =>
      workflowOperationObservation(
        snapshot([metric({ reconciliationPendingOperations: 5 })]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("cannot be lower than unresolved operations in the observation window");
  });

  it("allows the current reconciliation backlog to exceed the lookback cohort", () => {
    expect(() =>
      workflowOperationObservation(
        snapshot([metric({ reconciliationPendingOperations: 11 })]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).not.toThrow();
  });

  it("requires honest operation-latency evidence instead of synthetic zeroes", () => {
    expect(() =>
      workflowOperationObservation(
        snapshot([
          metric({
            operationLatencySamples: 0,
            p50OperationLatencyMs: null,
            p95OperationLatencyMs: null,
            p99OperationLatencyMs: null,
          }),
        ]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).not.toThrow();

    expect(() =>
      workflowOperationObservation(
        snapshot([
          metric({
            operationLatencySamples: 0,
            p50OperationLatencyMs: 0,
            p95OperationLatencyMs: 0,
            p99OperationLatencyMs: 0,
          }),
        ]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("must be null when no trustworthy timing samples exist");

    expect(() =>
      workflowOperationObservation(
        snapshot([metric({ operationLatencySamples: 96 })]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("operationLatencySamples cannot exceed completedOperations");

    expect(() =>
      workflowOperationObservation(
        snapshot([metric({ p50OperationLatencyMs: 500, p95OperationLatencyMs: 400 })]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("operation latency percentiles must be monotonic");
  });

  it("rejects unsupported snapshot schema versions", () => {
    const unsupported = {
      ...snapshot([metric()]),
      schemaVersion: 2,
    } as unknown as V3WorkflowSliSnapshot;

    expect(() =>
      workflowOperationObservation(
        unsupported,
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("schemaVersion must be 3");
  });

  it("rejects malformed evidence identity and observation windows", () => {
    expect(() =>
      workflowOperationObservation(
        { ...snapshot([metric()]), windowMinutes: 1 },
        "confirmation_submission",
        { environment: "local-supabase", commitSha: SHA },
      )
    ).toThrow("windowMinutes must be between 5 and 10080");

    expect(() =>
      workflowOperationObservation(
        snapshot([metric()]),
        "confirmation_submission",
        { environment: "", commitSha: "not-a-sha" },
      )
    ).toThrow("environment is required");

    expect(() =>
      workflowOperationObservation(
        snapshot([metric()]),
        "confirmation_submission",
        { environment: "local-supabase", commitSha: "not-a-sha" },
      )
    ).toThrow("commitSha must be an exact 40-character SHA");
  });
});
