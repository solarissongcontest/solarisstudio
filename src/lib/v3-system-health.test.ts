import { describe, expect, it } from "vitest";
import {
  buildV3SystemHealth,
  type V3RecoveryReadinessSummary,
} from "./v3-system-health";
import type {
  V3OperationalMetricsSnapshot,
  V3SloEvaluation,
} from "./v3-reliability-slo";

function snapshot(
  overrides: {
    operations?: Partial<V3OperationalMetricsSnapshot["operations"]>;
    deliveries?: Partial<V3OperationalMetricsSnapshot["deliveries"]>;
    reconciliation?: Partial<V3OperationalMetricsSnapshot["reconciliation"]>;
  } = {},
): V3OperationalMetricsSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: "2026-10-17T14:00:00.000Z",
    windowMinutes: 60,
    windowStart: "2026-10-17T13:00:00.000Z",
    operations: {
      total: 100,
      completed: 100,
      processing: 0,
      succeeded: 100,
      failed: 0,
      uncertain: 0,
      successRate: 1,
      oldestProcessingAgeSeconds: 0,
      errorCounts: {},
      ...overrides.operations,
    },
    deliveries: {
      total: 100,
      pending: 0,
      processing: 0,
      completed: 100,
      deadLetter: 0,
      retrying: 0,
      totalAttempts: 100,
      expiredProcessingLeases: 0,
      oldestActionableAgeSeconds: 0,
      averageCompletedLagMs: 100,
      p95CompletedLagMs: 200,
      maxCompletedLagMs: 300,
      errorCounts: {},
      ...overrides.deliveries,
    },
    reconciliation: {
      processingOperations: 0,
      uncertainOperations: 0,
      oldestProcessingAgeSeconds: 0,
      deadLetterDeliveries: 0,
      expiredProcessingLeases: 0,
      ...overrides.reconciliation,
    },
  };
}

function evaluation(overrides: Partial<V3SloEvaluation> = {}): V3SloEvaluation {
  return {
    status: "ok",
    policyId: "measured-baseline-v1",
    generatedAt: "2026-10-17T14:00:00.000Z",
    sample: { completedOperations: 100, windowMinutes: 60 },
    alerts: [],
    policyErrors: [],
    ...overrides,
  };
}

const recoveryReadiness: V3RecoveryReadinessSummary = {
  rebuildableProjectionCount: 2,
  blockedProjectionCount: 3,
  maxBatchSize: 25,
  deadLetterReplayAvailable: true,
};

describe("System V3 privacy-safe System Health contract", () => {
  it("returns aggregate healthy state without user, payload or high-cardinality labels", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot(),
      evaluation: evaluation(),
      recoveryReadiness,
    });

    expect(health.status).toBe("healthy");
    expect(health.subsystems.operations.status).toBe("healthy");
    expect(health.subsystems.consequences.status).toBe("healthy");
    expect(health.subsystems.reconciliation.status).toBe("healthy");
    expect(health.recoveryReadiness.status).toBe("partial");
    expect(health.privacy).toEqual({
      aggregateOnly: true,
      userIdentifiers: false,
      rawPayloads: false,
      highCardinalityLabels: false,
    });
    expect(JSON.stringify(health)).not.toContain("actorId");
    expect(JSON.stringify(health)).not.toContain("payload");
  });

  it("degrades on actionable reconciliation state even when a policy did not threshold it", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot({
        deliveries: { deadLetter: 1 },
        reconciliation: { deadLetterDeliveries: 1 },
      }),
      evaluation: evaluation(),
      recoveryReadiness,
    });

    expect(health.status).toBe("degraded");
    expect(health.subsystems.consequences.status).toBe("degraded");
    expect(health.subsystems.reconciliation).toMatchObject({
      status: "degraded",
      required: true,
      reasons: ["dead_letter_deliveries"],
    });
    expect(health.operatorActions).toContain(
      "Diagnose each exact dead-letter event/consumer pair before bounded canonical replay.",
    );
  });

  it("maps measured critical alerts to the affected subsystem and preserves the operator action", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot({ operations: { successRate: 0.8 } }),
      evaluation: evaluation({
        status: "critical",
        alerts: [
          {
            code: "operation_success_rate_low",
            severity: "critical",
            metric: "operationSuccessRate",
            observed: 0.8,
            threshold: 0.9,
            operatorAction: "Inspect aggregate failure classes before retries.",
          },
        ],
      }),
    });

    expect(health.status).toBe("critical");
    expect(health.subsystems.operations.status).toBe("critical");
    expect(health.criticalAlertCodes).toEqual(["operation_success_rate_low"]);
    expect(health.operatorActions).toEqual(["Inspect aggregate failure classes before retries."]);
  });

  it("reports insufficient data without inventing a healthy state", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot(),
      evaluation: evaluation({ status: "insufficient_data" }),
    });
    expect(health.status).toBe("insufficient_data");
    expect(health.recoveryReadiness.status).toBe("unknown");
  });

  it("fails closed when the SLO evaluation does not describe the same metrics snapshot", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot(),
      evaluation: evaluation({
        generatedAt: "2026-10-17T14:01:00.000Z",
        sample: { completedOperations: 99, windowMinutes: 30 },
      }),
    });

    expect(health.status).toBe("invalid");
    expect(health.subsystems.operations.status).toBe("unknown");
    expect(health.validationErrors).toEqual([
      "SLO evaluation generatedAt does not match snapshot generatedAt",
      "SLO evaluation window does not match snapshot window",
      "SLO evaluation completed-operation sample does not match snapshot",
    ]);
  });

  it("fails closed on internally inconsistent SLO evaluation semantics", () => {
    const warningWithoutAlerts = buildV3SystemHealth({
      snapshot: snapshot(),
      evaluation: evaluation({ status: "warning", alerts: [] }),
    });
    expect(warningWithoutAlerts.status).toBe("invalid");
    expect(warningWithoutAlerts.validationErrors).toContain(
      "SLO evaluation warning status must contain warning alerts and no critical alerts",
    );

    const invalidPolicyWithoutErrors = buildV3SystemHealth({
      snapshot: snapshot(),
      evaluation: evaluation({ status: "invalid_policy", policyErrors: [] }),
    });
    expect(invalidPolicyWithoutErrors.status).toBe("invalid");
    expect(invalidPolicyWithoutErrors.validationErrors).toContain(
      "SLO evaluation invalid_policy status must include policy errors",
    );
  });

  it("fails closed when the S9 reconciliation summary disagrees with its source counters", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot({
        operations: { uncertain: 2 },
        deliveries: { deadLetter: 1, expiredProcessingLeases: 1 },
        reconciliation: {
          uncertainOperations: 0,
          deadLetterDeliveries: 0,
          expiredProcessingLeases: 0,
        },
      }),
      evaluation: evaluation(),
    });

    expect(health.status).toBe("invalid");
    expect(health.validationErrors).toEqual([
      "reconciliation uncertainOperations does not match operations.uncertain",
      "reconciliation deadLetterDeliveries does not match deliveries.deadLetter",
      "reconciliation expiredProcessingLeases does not match deliveries",
    ]);
  });

  it("fails closed on malformed aggregate metrics instead of producing operator claims", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot({ deliveries: { deadLetter: -1 } }),
      evaluation: evaluation(),
    });
    expect(health.status).toBe("invalid");
    expect(health.validationErrors).toContain("deliveryDeadLetter must be a non-negative integer");
  });

  it("fails closed on malformed recovery readiness instead of reporting recovery capability", () => {
    const health = buildV3SystemHealth({
      snapshot: snapshot(),
      evaluation: evaluation(),
      recoveryReadiness: {
        rebuildableProjectionCount: 2,
        blockedProjectionCount: -1,
        maxBatchSize: 0,
        deadLetterReplayAvailable: true,
      },
    });

    expect(health.status).toBe("invalid");
    expect(health.recoveryReadiness.status).toBe("unknown");
    expect(health.validationErrors).toEqual([
      "recovery blockedProjectionCount must be a non-negative integer",
      "recovery maxBatchSize must be a positive integer",
    ]);
  });
});
