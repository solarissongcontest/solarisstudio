import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessV3CapacityEvidence,
  type V3CapacityEvidenceContext,
} from "./v3-capacity-evidence";
import {
  V3_CAPACITY_BUDGET_BANDS,
  v3CapacityScenario,
} from "./v3-capacity-scenarios";

const SHA = "2222222222222222222222222222222222222222";
const SCENARIO_ID = "confirmation-deadline";

function completeReport() {
  return {
    schemaVersion: 3,
    scenarioId: SCENARIO_ID,
    evidenceIdentity: {
      commitSha: SHA,
      loadShapeSource: "explicit-rehearsal-plan",
      loadShapeRationale: "Bounded deadline rehearsal derived from the approved local test plan.",
    },
    target: "http://127.0.0.1:4173/api/rehearsal",
    method: "POST",
    requestedLoad: {
      requests: 66,
      concurrency: 12,
      databaseSampleIntervalMs: 250,
    },
    runtime: {
      nodeVersion: "v22.0.0",
      platform: "linux",
      architecture: "x64",
    },
    startedAt: "2026-10-17T10:00:00.000Z",
    endedAt: "2026-10-17T10:00:04.000Z",
    durationMs: 4000,
    requestThroughputPerSecond: 16.5,
    latencyMs: { p50: 90, p95: 180, p99: 240, max: 300 },
    outcomes: {
      successes: 66,
      httpErrors: 0,
      transportErrors: 0,
      errorRate: 0,
      statusCounts: { 200: 66 },
    },
    egress: {
      observedResponseBytes: 4096,
      note: "local client-observed response bytes; not provider-billed egress",
    },
    clientMemory: {
      before: { rssBytes: 10_000_000 },
      after: { rssBytes: 11_000_000 },
      peakObserved: { rssBytes: 12_000_000 },
    },
    databaseActivity: {
      connectionPressure: {
        before: 3,
        after: 3,
        peakObservedConnections: 8,
        peakObservedActiveConnections: 6,
      },
      lockContention: {
        waitingConnectionsBefore: 0,
        waitingConnectionsAfter: 0,
        peakObservedWaitingConnections: 0,
        peakObservedUngrantedDatabaseLocks: 0,
      },
      peakObservedQueueDepth: 4,
      retryPressure: {
        retryingBefore: 0,
        retryingAfter: 0,
        peakObservedRetrying: 0,
        totalAttemptsDelta: 66,
      },
    },
    thresholds: null,
  };
}

function completeContext(): V3CapacityEvidenceContext {
  const scenario = v3CapacityScenario(SCENARIO_ID);
  if (!scenario) throw new Error("fixture scenario missing");

  return {
    expectedCommitSha: SHA,
    dimensionEvidence: scenario.capacityDimensions.map((dimension) => ({
      dimension,
      sourceType: "runtime-observation" as const,
      observedAt: "2026-10-17T10:05:00.000Z",
      reference: `runtime:${dimension}`,
      notes: `Fixture external/runtime evidence for ${dimension}.`,
    })),
    budgets: scenario.capacityDimensions.flatMap((dimension) =>
      V3_CAPACITY_BUDGET_BANDS.map((band, index) => ({
        dimension,
        band,
        limit: (index + 1) * 100,
        unit: "fixture-units",
        evidenceRef: `runtime:${dimension}`,
        rationale: `Fixture evidence-backed ${band} budget for ${dimension}.`,
      })),
    ),
  };
}

describe("System V3 S12 capacity evidence assessment", () => {
  it("marks complete evidence ready for QA review without claiming certification", () => {
    const assessment = assessV3CapacityEvidence(completeReport(), completeContext());
    expect(assessment).toMatchObject({
      status: "ready_for_qa_review",
      scenarioId: SCENARIO_ID,
      expectedCommitSha: SHA,
      reportCommitSha: SHA,
      certificationClaim: false,
      qaReviewRequired: true,
    });
    expect(assessment.errors).toEqual([]);
    expect(assessment.missingMeasurements).toEqual([]);
    expect(assessment.missingExternalEvidenceDimensions).toEqual([]);
    expect(assessment.missingBudgetKeys).toEqual([]);
  });

  it("reports missing database, lock, connection, queue and retry measurements instead of silently passing", () => {
    const assessment = assessV3CapacityEvidence(
      { ...completeReport(), databaseActivity: null },
      completeContext(),
    );
    expect(assessment.status).toBe("measurement_incomplete");
    expect(assessment.missingMeasurements).toEqual([
      "database-activity",
      "lock-contention",
      "connection-pressure",
      "queue-depth",
      "retry-pressure",
    ]);
  });

  it("requires an explicit database sampling interval whenever database activity is attached", () => {
    const report = completeReport();
    const assessment = assessV3CapacityEvidence(
      {
        ...report,
        requestedLoad: { ...report.requestedLoad, databaseSampleIntervalMs: null },
      },
      completeContext(),
    );
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "capacity report databaseSampleIntervalMs must be positive when database activity is present",
    );
  });

  it("keeps external/runtime evidence and capacity budgets mandatory for review readiness", () => {
    const assessment = assessV3CapacityEvidence(completeReport(), {
      expectedCommitSha: SHA,
      dimensionEvidence: [],
      budgets: [],
    });
    const scenario = v3CapacityScenario(SCENARIO_ID);
    expect(assessment.status).toBe("evidence_incomplete");
    expect(assessment.missingExternalEvidenceDimensions).toEqual(scenario?.capacityDimensions);
    expect(assessment.missingBudgetKeys.length).toBe(
      (scenario?.capacityDimensions.length ?? 0) * V3_CAPACITY_BUDGET_BANDS.length,
    );
  });

  it("requires each budget to cite evidence for its own capacity dimension", () => {
    const context = completeContext();
    const firstDimension = context.dimensionEvidence[0].dimension;
    const secondDimension = context.dimensionEvidence[1].dimension;
    const budgets = context.budgets.map((budget) =>
      budget.dimension === firstDimension && budget.band === "normal"
        ? { ...budget, evidenceRef: `runtime:${secondDimension}` }
        : budget,
    );
    const assessment = assessV3CapacityEvidence(completeReport(), { ...context, budgets });
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      `budgets[0] evidenceRef does not reference evidence for ${firstDimension}`,
    );
  });

  it("fails closed on wrong SHA, non-local target, embedded thresholds or inconsistent outcomes", () => {
    const report = completeReport();
    const assessment = assessV3CapacityEvidence(
      {
        ...report,
        target: "https://example.supabase.co/rehearsal",
        evidenceIdentity: {
          ...report.evidenceIdentity,
          commitSha: "3333333333333333333333333333333333333333",
        },
        outcomes: { ...report.outcomes, successes: 65 },
        thresholds: { p95: 100 },
      },
      completeContext(),
    );
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("capacity report commitSha does not match expectedCommitSha");
    expect(assessment.errors).toContain("capacity report target must be loopback/local");
    expect(assessment.errors).toContain("capacity report must not embed pass/fail thresholds");
    expect(assessment.errors).toContain("capacity report outcome totals do not equal requested requests");
  });

  it("rejects negative counters and an error rate that disagrees with the counters", () => {
    const report = completeReport();
    const negative = assessV3CapacityEvidence(
      { ...report, outcomes: { ...report.outcomes, httpErrors: -1 } },
      completeContext(),
    );
    expect(negative.status).toBe("invalid");
    expect(negative.errors).toContain(
      "capacity report outcome counters must be non-negative integers",
    );

    const inconsistent = assessV3CapacityEvidence(
      {
        ...report,
        outcomes: {
          ...report.outcomes,
          successes: 65,
          httpErrors: 1,
          errorRate: 0,
        },
      },
      completeContext(),
    );
    expect(inconsistent.status).toBe("invalid");
    expect(inconsistent.errors).toContain(
      "capacity report errorRate does not match outcome counters",
    );
  });

  it("rejects impossible timing and latency ordering", () => {
    const report = completeReport();
    const assessment = assessV3CapacityEvidence(
      {
        ...report,
        endedAt: "2026-10-17T09:59:59.000Z",
        latencyMs: { p50: 90, p95: 250, p99: 200, max: 300 },
      },
      completeContext(),
    );
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("capacity report endedAt cannot be before startedAt");
    expect(assessment.errors).toContain(
      "capacity report latency percentiles/max must be nondecreasing",
    );
  });

  it("rejects decreasing or unit-inconsistent budget bands", () => {
    const context = completeContext();
    const firstDimension = context.dimensionEvidence[0].dimension;
    const budgets = context.budgets.map((budget) => {
      if (budget.dimension !== firstDimension) return budget;
      if (budget.band === "peak") return { ...budget, limit: 50 };
      if (budget.band === "hard-safety-limit") return { ...budget, unit: "other-units" };
      return budget;
    });
    const assessment = assessV3CapacityEvidence(completeReport(), { ...context, budgets });
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(`${firstDimension} capacity budget bands must use one unit`);
  });

  it("keeps the executable evidence generator offline and review-oriented", () => {
    const generator = readFileSync(
      resolve(process.cwd(), "scripts/generate-v3-capacity-evidence.ts"),
      "utf8",
    );
    const runbook = readFileSync(
      resolve(process.cwd(), "docs/runbooks/capacity-evidence-review.md"),
      "utf8",
    );
    expect(generator).not.toContain("fetch(");
    expect(generator).toContain("V3_CAPACITY_REQUIRE_REVIEW_READY");
    expect(runbook).toContain("does not certify production capacity");
    expect(runbook).toContain("Never run the capacity harness against production");
  });
});
