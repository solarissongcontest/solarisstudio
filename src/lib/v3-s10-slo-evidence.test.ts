import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_SLO_SCOPES } from "./v3-error-budget";
import { V3_STARTER_AVAILABILITY_POLICIES } from "./v3-s10-slo-policy";
import {
  assessV3S10SloEvidence,
  V3_S10_REQUIRED_CRITICAL_ALERTS,
} from "./v3-s10-slo-evidence";

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = "2026-10-24T17:30:00.000Z";

function completeEvidence() {
  return {
    schemaVersion: 1,
    candidateCommitSha: SHA,
    productionTrafficGenerated: false,
    certificationClaim: false,
    qaReviewRequired: true,
    baseline: {
      schemaVersion: 1,
      capturedAt: NOW,
      source: "production_observation",
      environment: "production-read-only-observation",
      commitSha: SHA,
      windowMinutes: 60,
      completedOperations: 500,
      metrics: {
        operationSuccessRate: 0.999,
        p95ConsequenceLagMs: 320,
        oldestActionableDeliveryAgeSeconds: 4,
        deadLetterDeliveries: 0,
        expiredProcessingLeases: 0,
        uncertainOperations: 0,
        oldestProcessingOperationAgeSeconds: 2,
      },
    },
    review: {
      reviewedAt: NOW,
      reviewer: "release-reliability-review",
      source: "production_observation",
      baselineReference: "artifact:s10-baseline.json#sha256:abc123",
      rationale: "Reviewed bounded privacy-safe S9/S10 production telemetry before activating starter objectives.",
      objectives: V3_SLO_SCOPES.map((scope) => ({
        scope,
        targetSuccessRatio: V3_STARTER_AVAILABILITY_POLICIES[scope].targetSuccessRatio ?? 0.995,
        minimumCompletedOperations: 50,
        evidenceRef: `telemetry:${scope}`,
        rationale: `Reviewed initial availability objective for ${scope}.`,
      })),
      latencyGoals: {
        criticalCommandAcknowledgementP95Ms: 1500,
        commonCachedPublicProjectionP95Ms: 1000,
        evidenceRef: "telemetry:latency-review",
        rationale: "Reviewed the canonical starter p95 targets against measured telemetry.",
      },
    },
    alerts: V3_S10_REQUIRED_CRITICAL_ALERTS.map((code) => ({
      code,
      severity: "critical",
      condition: `Canonical ${code} condition`,
      thresholdRef: `policy:${code}`,
      functional: true,
      testedAt: NOW,
      testEvidenceRef: `alert-test:${code}`,
    })),
    errorBudgetDashboard: {
      reference: "dashboard:s10-error-budgets",
      reviewedAt: NOW,
      reviewer: "release-reliability-review",
      containsAllCanonicalScopes: true,
      errorBudgetStatusVisible: true,
      alertStateVisible: true,
    },
    scopeHealth: V3_SLO_SCOPES.map((scope) => ({
      scope,
      status: "healthy",
      evidenceRef: `evaluation:${scope}`,
      evaluatedAt: NOW,
    })),
    correctness: {
      duplicateCommittedOperations: 0,
      silentLostSuccessfulOperations: 0,
      wrongEditionOfficialMutations: 0,
      evidenceRef: "correctness:s10-zero-tolerance",
      observedAt: NOW,
    },
    unresolvedIssues: [],
  };
}

describe("System V3 S10 exact-SHA SLO evidence", () => {
  it("marks complete reviewed exact-SHA evidence ready for QA without claiming certification", () => {
    const assessment = assessV3S10SloEvidence(completeEvidence(), SHA);
    expect(assessment).toMatchObject({
      phase: "S10",
      candidateCommitSha: SHA,
      status: "ready_for_qa_review",
      passed: true,
      productionTrafficGenerated: false,
      certificationClaim: false,
      qaReviewRequired: true,
    });
    expect(assessment.issuesFound).toEqual([]);
  });

  it("fails closed on mixed SHA or any production/certification overclaim", () => {
    const input = completeEvidence();
    input.baseline.commitSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    input.productionTrafficGenerated = true;
    input.certificationClaim = true;
    const assessment = assessV3S10SloEvidence(input, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.passed).toBe(false);
    expect(assessment.errors).toContain("baseline.commitSha must match candidateCommitSha");
    expect(assessment.errors).toContain(
      "S10 evidence must explicitly state productionTrafficGenerated=false",
    );
    expect(assessment.errors).toContain("S10 evidence must explicitly state certificationClaim=false");
  });

  it("keeps incomplete measured SLIs distinct from reviewed-policy gaps", () => {
    const input = completeEvidence();
    input.baseline.completedOperations = 0;
    input.baseline.metrics.operationSuccessRate = Number.NaN;
    const assessment = assessV3S10SloEvidence(input, SHA);
    expect(assessment.status).toBe("measurement_incomplete");
    expect(assessment.missingMeasurements).toContain("completedOperations");
    expect(assessment.missingMeasurements).toContain("operationSuccessRate");
  });

  it("requires every canonical S10 scope and production-observation review before readiness", () => {
    const input = completeEvidence();
    input.review.source = "staging";
    input.review.objectives = input.review.objectives.slice(1);
    const assessment = assessV3S10SloEvidence(input, SHA);
    expect(assessment.status).toBe("review_incomplete");
    expect(assessment.missingReviewedScopes).toContain(V3_SLO_SCOPES[0]);
    expect(assessment.issuesFound).toContain(
      "S10 objectives and latency goals require reviewed production-observation evidence",
    );
  });

  it("requires functional proof for every canonical critical alert", () => {
    const input = completeEvidence();
    input.alerts[0].functional = false;
    const assessment = assessV3S10SloEvidence(input, SHA);
    expect(assessment.status).toBe("alert_incomplete");
    expect(assessment.missingFunctionalAlerts).toContain(V3_S10_REQUIRED_CRITICAL_ALERTS[0]);
  });

  it("blocks readiness when a scope is unhealthy, correctness is nonzero or an issue remains", () => {
    const input = completeEvidence();
    input.scopeHealth[2].status = "reliability_freeze";
    input.correctness.duplicateCommittedOperations = 1;
    input.unresolvedIssues = ["alert provider acknowledgement is still pending"];
    const assessment = assessV3S10SloEvidence(input, SHA);
    expect(assessment.status).toBe("blocked");
    expect(assessment.passed).toBe(false);
    expect(assessment.unhealthyScopes).toContain(V3_SLO_SCOPES[2]);
    expect(assessment.issuesFound).toContain("correctness.duplicateCommittedOperations is 1; zero is required");
  });

  it("keeps the generator offline and the runbook explicit about bounded production observation", () => {
    const generator = readFileSync(
      resolve(process.cwd(), "scripts/generate-v3-s10-slo-evidence.ts"),
      "utf8",
    );
    const runbook = readFileSync(
      resolve(process.cwd(), "docs/runbooks/s10-slo-evidence.md"),
      "utf8",
    );
    expect(generator).not.toContain("fetch(");
    expect(generator).toContain("V3_S10_EXPECTED_SHA");
    expect(generator).toContain("V3_S10_REQUIRE_REVIEW_READY");
    expect(runbook).toContain("does not generate production traffic");
    expect(runbook).toContain("Never point automated S10 evidence generation at hosted Supabase");
  });
});
