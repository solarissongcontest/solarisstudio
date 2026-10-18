import { describe, expect, it } from "vitest";
import {
  evaluateV3CapacityEvidence,
  type V3CapacityBudgetPlan,
  type V3CapacityEvidenceKind,
} from "./v3-capacity-evidence";
import {
  V3_CAPACITY_BUDGET_BANDS,
  v3CapacityScenario,
  type V3CapacityDimension,
} from "./v3-capacity-scenarios";

const SHA = "1111111111111111111111111111111111111111";

function plan(
  scenarioId = "show-start-live-refresh",
  providerKind: V3CapacityEvidenceKind = "provider_constraint",
): V3CapacityBudgetPlan {
  const scenario = v3CapacityScenario(scenarioId);
  if (!scenario) throw new Error("missing scenario fixture");
  return {
    schemaVersion: 1,
    id: `${scenarioId}-budget-v1`,
    scenarioId,
    recordedAt: "2026-10-18T05:30:00.000Z",
    commitSha: SHA,
    rationale: "Fixture budget values stand in for explicitly reviewed evidence in unit tests only.",
    dimensions: scenario.capacityDimensions.map((dimension, dimensionIndex) => ({
      dimension,
      unit: `${dimension}-units`,
      bands: Object.fromEntries(
        V3_CAPACITY_BUDGET_BANDS.map((band, bandIndex) => [
          band,
          {
            value: (dimensionIndex + 1) * 100 + bandIndex * 100,
            evidenceIds: [`evidence-${dimension}`],
          },
        ]),
      ),
    })),
    evidence: scenario.capacityDimensions.map((dimension) => ({
      id: `evidence-${dimension}`,
      kind: providerKind,
      environment: "provider-reviewed",
      observedAt: "2026-10-18T05:00:00.000Z",
      recordedAgainstCommitSha: SHA,
      rationale: `Fixture evidence for ${dimension}.`,
      sourceReference: `fixture:${dimension}`,
      dimensions: [dimension],
      bands: V3_CAPACITY_BUDGET_BANDS,
    })),
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    scenarioId: "show-start-live-refresh",
    evidenceIdentity: {
      commitSha: SHA,
      loadShapeSource: "approved-forecast",
      loadShapeRationale: "Fixture uses an explicitly approved rehearsal shape.",
    },
    requestedLoad: {
      requests: 100,
      concurrency: 10,
      databaseSampleIntervalMs: 250,
    },
    runtime: { nodeVersion: "v24.0.0", platform: "linux", architecture: "x64" },
    startedAt: "2026-10-18T05:00:00.000Z",
    endedAt: "2026-10-18T05:00:10.000Z",
    durationMs: 10000,
    requestThroughputPerSecond: 10,
    latencyMs: { p50: 20, p95: 50, p99: 80, max: 120 },
    outcomes: {
      successes: 99,
      httpErrors: 1,
      transportErrors: 0,
      errorRate: 0.01,
      statusCounts: { 200: 99, 500: 1 },
    },
    egress: { observedResponseBytes: 10000 },
    clientMemory: { before: {}, after: {}, peakObserved: { rssBytes: 1000 } },
    databaseActivity: {
      xactCommit: 50,
      sampling: { intervalMs: 250, samples: 20 },
      connectionPressure: { peakObservedConnections: 8, peakObservedActiveConnections: 4 },
      lockContention: { peakObservedWaitingConnections: 0, peakObservedUngrantedDatabaseLocks: 0 },
      peakObservedQueueDepth: 2,
      retryPressure: { peakObservedRetrying: 0, maxAttemptsObserved: 1 },
    },
    thresholds: null,
    ...overrides,
  };
}

describe("System V3 S12 capacity evidence interpretation", () => {
  it("accepts a complete evidence-backed local report without claiming certification", () => {
    const result = evaluateV3CapacityEvidence(plan(), report());
    expect(result.status).toBe("comparison_ready");
    expect(result.comparisonReady).toBe(true);
    expect(result.budget.complete).toBe(true);
    expect(result.budget.providerEvidenceComplete).toBe(true);
    expect(result.report.missingMeasurements).toEqual([]);
    expect(result.certificationClaim).toBe(false);
  });

  it("keeps exploratory load shapes explicitly non-comparable for evidence-backed review", () => {
    const result = evaluateV3CapacityEvidence(
      plan(),
      report({
        evidenceIdentity: {
          commitSha: SHA,
          loadShapeSource: "exploratory",
          loadShapeRationale: "Intentional exploratory smoke load.",
        },
      }),
    );
    expect(result.status).toBe("exploratory");
    expect(result.comparisonReady).toBe(false);
    expect(result.releaseEvidenceGaps).toContain("load shape is exploratory rather than evidence-backed");
  });

  it("reports missing local database/queue measurements instead of pretending provider evidence fills them", () => {
    const result = evaluateV3CapacityEvidence(plan(), report({ databaseActivity: null }));
    expect(result.status).toBe("evidence_incomplete");
    expect(result.report.missingMeasurements).toEqual(expect.arrayContaining([
      "database-activity",
      "lock-contention",
      "connection-pressure",
      "queue-depth",
      "retry-pressure",
    ]));
    expect(result.comparisonReady).toBe(false);
  });

  it("requires all four canonical budget bands for every scenario dimension", () => {
    const candidate = plan();
    const first = candidate.dimensions[0];
    const modified: V3CapacityBudgetPlan = {
      ...candidate,
      dimensions: [
        {
          ...first,
          bands: { ...first.bands, peak: undefined },
        },
        ...candidate.dimensions.slice(1),
      ],
    };
    const result = evaluateV3CapacityEvidence(modified, report());
    expect(result.status).toBe("evidence_incomplete");
    expect(result.gaps.some((gap) => gap.includes("is missing peak budget"))).toBe(true);
  });

  it("rejects unsupported or decreasing capacity budgets and bad evidence references", () => {
    const candidate = plan();
    const first = candidate.dimensions[0];
    const dimension = first.dimension as V3CapacityDimension;
    const modified: V3CapacityBudgetPlan = {
      ...candidate,
      dimensions: [
        {
          ...first,
          bands: {
            ...first.bands,
            normal: { value: 500, evidenceIds: ["missing-evidence"] },
            "contest-day": { value: 100, evidenceIds: [`evidence-${dimension}`] },
          },
        },
        ...candidate.dimensions.slice(1),
      ],
    };
    const result = evaluateV3CapacityEvidence(modified, report());
    expect(result.status).toBe("invalid");
    expect(result.validationErrors).toContain(
      `${dimension} budget bands must be non-decreasing from normal to hard-safety-limit`,
    );
    expect(result.validationErrors).toContain(
      `${dimension} normal references unknown evidence missing-evidence`,
    );
  });

  it("separates local comparison readiness from missing provider evidence", () => {
    const result = evaluateV3CapacityEvidence(plan("show-start-live-refresh", "local_rehearsal"), report());
    expect(result.status).toBe("comparison_ready");
    expect(result.comparisonReady).toBe(true);
    expect(result.budget.providerEvidenceComplete).toBe(false);
    expect(result.releaseEvidenceGaps.some((gap) => gap.includes("lacks provider constraint/runtime evidence"))).toBe(true);
    expect(result.certificationClaim).toBe(false);
  });

  it("rejects internally inconsistent harness reports", () => {
    const result = evaluateV3CapacityEvidence(
      plan(),
      report({
        requestedLoad: { requests: 100, concurrency: 200, databaseSampleIntervalMs: 250 },
        latencyMs: { p50: 20, p95: 100, p99: 50, max: 120 },
        outcomes: { successes: 100, httpErrors: 1, transportErrors: 0, errorRate: 0.5 },
        thresholds: { p95: 50 },
      }),
    );
    expect(result.status).toBe("invalid");
    expect(result.validationErrors).toEqual(expect.arrayContaining([
      "capacity report concurrency cannot exceed requests",
      "capacity report outcome counts must equal requested requests",
      "capacity report errorRate does not match outcome counts",
      "capacity report p99 latency cannot be lower than p95 latency",
      "capacity report thresholds must remain null; targets belong to evidence-backed policy",
    ]));
  });
});
