import { describe, expect, it } from "vitest";
import {
  captureV3SliBaseline,
  classifyV3ReliabilityFailure,
  evaluateV3SloPolicy,
  validateV3SloPolicy,
  type V3OperationalMetricsSnapshot,
  type V3SloPolicy,
} from "./v3-reliability-slo";

const SHA = "1111111111111111111111111111111111111111";

function snapshot(overrides: Partial<V3OperationalMetricsSnapshot> = {}): V3OperationalMetricsSnapshot {
  const base: V3OperationalMetricsSnapshot = {
    schemaVersion: 1,
    generatedAt: "2026-10-17T09:30:00.000Z",
    windowMinutes: 60,
    windowStart: "2026-10-17T08:30:00.000Z",
    operations: {
      total: 100,
      completed: 100,
      processing: 0,
      succeeded: 99,
      failed: 1,
      uncertain: 0,
      successRate: 0.99,
      oldestProcessingAgeSeconds: 0,
      errorCounts: { VALIDATION: 1 },
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
      averageCompletedLagMs: 120,
      p95CompletedLagMs: 250,
      maxCompletedLagMs: 400,
      errorCounts: {},
    },
    reconciliation: {
      processingOperations: 0,
      uncertainOperations: 0,
      oldestProcessingAgeSeconds: 0,
      deadLetterDeliveries: 0,
      expiredProcessingLeases: 0,
    },
  };

  return {
    ...base,
    ...overrides,
    operations: { ...base.operations, ...overrides.operations },
    deliveries: { ...base.deliveries, ...overrides.deliveries },
    reconciliation: { ...base.reconciliation, ...overrides.reconciliation },
  };
}

function policy(
  overrides: Partial<Omit<V3SloPolicy, "evidence">> & {
    evidence?: Partial<V3SloPolicy["evidence"]>;
  } = {},
): V3SloPolicy {
  const base: V3SloPolicy = {
    id: "measured-local-baseline-v1",
    evidence: {
      source: "isolated_rehearsal",
      environment: "local-supabase",
      observedAt: "2026-10-17T09:20:00.000Z",
      commitSha: SHA,
      windowMinutes: 60,
      sampleCount: 100,
      rationale: "Threshold fixture derived from a bounded isolated rehearsal for test purposes.",
    },
    minCompletedOperations: 20,
    thresholds: {
      operationSuccessRate: { warningBelow: 0.98, criticalBelow: 0.95 },
      p95ConsequenceLagMs: { warningAbove: 500, criticalAbove: 1000 },
      deadLetterDeliveries: { warningAbove: 0, criticalAbove: 2 },
      expiredProcessingLeases: { warningAbove: 0, criticalAbove: 2 },
      uncertainOperations: { warningAbove: 0, criticalAbove: 2 },
    },
  };

  return {
    ...base,
    ...overrides,
    evidence: { ...base.evidence, ...overrides.evidence },
    thresholds: { ...base.thresholds, ...overrides.thresholds },
  };
}

describe("System V3 S9/S10 reliability classification and SLO policy", () => {
  it("derives reliability classes from the canonical operation error taxonomy without payload inspection", () => {
    expect(classifyV3ReliabilityFailure({ errorCode: "AUTHENTICATION" })).toBe("authentication_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "AUTHORIZATION" })).toBe("authorization_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "VALIDATION" })).toBe("validation_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "STATE_CHANGED" })).toBe("conflict_or_stale_state");
    expect(classifyV3ReliabilityFailure({ errorCode: "VERSION_CONFLICT" })).toBe("conflict_or_stale_state");
    expect(classifyV3ReliabilityFailure({ errorCode: "IDEMPOTENCY_CONFLICT" })).toBe("conflict_or_stale_state");
    expect(classifyV3ReliabilityFailure({ errorCode: "DEPENDENCY_FAILURE" })).toBe("dependency_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "DATABASE" })).toBe("transient_infrastructure_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "STORAGE" })).toBe("transient_infrastructure_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "TIMEOUT" })).toBe("transient_infrastructure_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "RATE_LIMIT" })).toBe("transient_infrastructure_failure");
    expect(classifyV3ReliabilityFailure({ errorCode: "UNKNOWN" })).toBe("unknown_failure");
  });

  it("lets explicit recovery context outrank transport-style error classification", () => {
    expect(
      classifyV3ReliabilityFailure({ errorCode: "TIMEOUT", reconciliationRequired: true }),
    ).toBe("reconciliation_pending");
    expect(
      classifyV3ReliabilityFailure({ errorCode: "DEPENDENCY_FAILURE", operatorRecoveryRequired: true }),
    ).toBe("operator_required_recovery");
    expect(
      classifyV3ReliabilityFailure({ errorCode: "DEPENDENCY_FAILURE", domainDisposition: "permanent" }),
    ).toBe("permanent_domain_failure");
  });

  it("rejects target policies that lack measured evidence or coherent thresholds", () => {
    const invalid: V3SloPolicy = {
      ...policy({
        evidence: { commitSha: "not-a-sha", rationale: "", sampleCount: 0 },
      }),
      thresholds: {},
    };
    const errors = validateV3SloPolicy(invalid);
    expect(errors).toContain("evidence rationale is required");
    expect(errors).toContain("evidence commitSha must be an exact 40-character SHA");
    expect(errors).toContain("evidence sampleCount must be a positive integer");
    expect(errors).toContain("at least one evidence-backed threshold is required");

    const inverted = policy({
      thresholds: {
        operationSuccessRate: { warningBelow: 0.95, criticalBelow: 0.99 },
        p95ConsequenceLagMs: { warningAbove: 1000, criticalAbove: 500 },
      },
    });
    expect(validateV3SloPolicy(inverted)).toEqual([
      "operationSuccessRate criticalBelow must not exceed warningBelow",
      "p95ConsequenceLagMs warningAbove must not exceed criticalAbove",
    ]);
  });

  it("returns insufficient_data instead of paging on tiny samples", () => {
    const result = evaluateV3SloPolicy(
      snapshot({ operations: { completed: 3, total: 3, succeeded: 1, failed: 2, successRate: 1 / 3 } as V3OperationalMetricsSnapshot["operations"] }),
      policy({ minCompletedOperations: 20 }),
    );
    expect(result.status).toBe("insufficient_data");
    expect(result.alerts).toEqual([]);
  });

  it("emits only operator-actionable warning/critical alerts for configured measured thresholds", () => {
    const warning = evaluateV3SloPolicy(
      snapshot({
        deliveries: {
          p95CompletedLagMs: 700,
          deadLetter: 1,
        } as Partial<V3OperationalMetricsSnapshot["deliveries"]> as V3OperationalMetricsSnapshot["deliveries"],
      }),
      policy(),
    );
    expect(warning.status).toBe("warning");
    expect(warning.alerts.map((alert) => alert.code).sort()).toEqual([
      "consequence_delivery_lag_high",
      "outbox_dead_letter_backlog_high",
    ]);
    expect(warning.alerts.every((alert) => alert.operatorAction.length > 20)).toBe(true);

    const critical = evaluateV3SloPolicy(
      snapshot({
        operations: {
          successRate: 0.9,
          uncertain: 3,
        } as Partial<V3OperationalMetricsSnapshot["operations"]> as V3OperationalMetricsSnapshot["operations"],
        deliveries: {
          expiredProcessingLeases: 3,
        } as Partial<V3OperationalMetricsSnapshot["deliveries"]> as V3OperationalMetricsSnapshot["deliveries"],
      }),
      policy(),
    );
    expect(critical.status).toBe("critical");
    expect(critical.alerts.filter((alert) => alert.severity === "critical").map((alert) => alert.code).sort()).toEqual([
      "operation_success_rate_low",
      "outbox_expired_leases_high",
      "uncertain_operations_high",
    ]);
  });

  it("captures a baseline snapshot without silently turning measurements into targets", () => {
    const baseline = captureV3SliBaseline(snapshot(), {
      source: "isolated_rehearsal",
      environment: "local-supabase",
      commitSha: SHA,
    });

    expect(baseline).toMatchObject({
      schemaVersion: 1,
      source: "isolated_rehearsal",
      environment: "local-supabase",
      commitSha: SHA,
      windowMinutes: 60,
      completedOperations: 100,
    });
    expect(baseline.metrics.operationSuccessRate).toBe(0.99);
    expect(baseline.metrics.p95ConsequenceLagMs).toBe(250);
    expect(baseline).not.toHaveProperty("thresholds");
    expect(baseline).not.toHaveProperty("slo");
  });
});
