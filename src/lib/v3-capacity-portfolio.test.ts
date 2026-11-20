import { describe, expect, it } from "vitest";
import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";
import { assessV3CapacityEvidencePortfolio } from "./v3-capacity-portfolio";

const SHA = "b32c97146ef11c104e7e5f7ce52a1f1fe3055b4c";

function readyAssessment(scenarioId: string): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: "ready_for_qa_review",
    scenarioId,
    expectedCommitSha: SHA,
    reportCommitSha: SHA,
    missingMeasurements: [],
    missingExternalEvidenceDimensions: [],
    missingBudgetKeys: [],
    errors: [],
    certificationClaim: false,
    qaReviewRequired: true,
  };
}

function completePortfolio(): Record<string, unknown>[] {
  return V3_CAPACITY_SCENARIOS.map((scenario) => readyAssessment(scenario.id));
}

describe("System V3 S12 exact-SHA capacity evidence portfolio", () => {
  it("becomes review-ready only when every canonical scenario is review-ready on one exact SHA", () => {
    const assessment = assessV3CapacityEvidencePortfolio(completePortfolio(), SHA);

    expect(assessment).toMatchObject({
      schemaVersion: 1,
      status: "ready_for_qa_review",
      expectedCommitSha: SHA,
      canonicalScenarioCount: V3_CAPACITY_SCENARIOS.length,
      observedScenarioCount: V3_CAPACITY_SCENARIOS.length,
      readyScenarioCount: V3_CAPACITY_SCENARIOS.length,
      missingScenarioIds: [],
      incompleteScenarioIds: [],
      invalidScenarioIds: [],
      missingMeasurements: [],
      missingExternalEvidenceDimensions: [],
      missingBudgetKeys: [],
      errors: [],
      certificationClaim: false,
      qaReviewRequired: true,
    });
  });

  it("reports a missing canonical peak scenario instead of treating a partial portfolio as complete", () => {
    const portfolio = completePortfolio().slice(1);
    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);

    expect(assessment.status).toBe("incomplete");
    expect(assessment.readyScenarioCount).toBe(V3_CAPACITY_SCENARIOS.length - 1);
    expect(assessment.missingScenarioIds).toEqual([V3_CAPACITY_SCENARIOS[0].id]);
    expect(assessment.certificationClaim).toBe(false);
  });

  it("fails closed on duplicate scenarios", () => {
    const portfolio = completePortfolio();
    portfolio.push(readyAssessment(V3_CAPACITY_SCENARIOS[0].id));

    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.invalidScenarioIds).toContain(V3_CAPACITY_SCENARIOS[0].id);
    expect(assessment.errors).toContain(
      `duplicate capacity scenario assessment ${V3_CAPACITY_SCENARIOS[0].id}`,
    );
  });

  it("rejects evidence from another commit instead of mixing capacity proof across SHAs", () => {
    const portfolio = completePortfolio();
    portfolio[0] = {
      ...portfolio[0]!,
      reportCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };

    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.invalidScenarioIds).toContain(V3_CAPACITY_SCENARIOS[0].id);
    expect(assessment.errors).toContain(
      "assessments[0] does not belong to the expected commit SHA",
    );
  });

  it("aggregates incomplete measurement, provider-evidence and budget gaps", () => {
    const portfolio = completePortfolio();
    portfolio[0] = {
      ...portfolio[0]!,
      status: "measurement_incomplete",
      missingMeasurements: ["p99-latency"],
      missingExternalEvidenceDimensions: ["supabase-egress"],
      missingBudgetKeys: ["supabase-egress:hard-safety-limit"],
    };
    portfolio[1] = {
      ...portfolio[1]!,
      status: "evidence_incomplete",
      missingExternalEvidenceDimensions: ["database-requests"],
      missingBudgetKeys: ["database-requests:peak"],
    };

    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);
    expect(assessment.status).toBe("incomplete");
    expect(assessment.incompleteScenarioIds).toEqual(
      [V3_CAPACITY_SCENARIOS[0].id, V3_CAPACITY_SCENARIOS[1].id].sort(),
    );
    expect(assessment.missingMeasurements).toEqual(["p99-latency"]);
    expect(assessment.missingExternalEvidenceDimensions).toEqual([
      "database-requests",
      "supabase-egress",
    ]);
    expect(assessment.missingBudgetKeys).toEqual([
      "database-requests:peak",
      "supabase-egress:hard-safety-limit",
    ]);
  });

  it("rejects a child status that contradicts its unresolved evidence", () => {
    const portfolio = completePortfolio();
    portfolio[0] = {
      ...portfolio[0]!,
      status: "evidence_incomplete",
      missingMeasurements: ["p99-latency"],
    };

    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "assessments[0] status does not match its unresolved evidence",
    );
  });

  it("rejects a non-invalid child status that still carries validation errors", () => {
    const portfolio = completePortfolio();
    portfolio[0] = {
      ...portfolio[0]!,
      status: "evidence_incomplete",
      missingExternalEvidenceDimensions: ["supabase-egress"],
      errors: ["malformed source evidence"],
    };

    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "assessments[0] status does not match its unresolved evidence",
    );
  });

  it("rejects fields outside the selected scenario contract", () => {
    const portfolio = completePortfolio();
    portfolio[0] = {
      ...portfolio[0]!,
      status: "measurement_incomplete",
      missingMeasurements: ["magic-capacity-number"],
      missingExternalEvidenceDimensions: ["production-vibes"],
      missingBudgetKeys: ["storage:peak"],
    };

    const assessment = assessV3CapacityEvidencePortfolio(portfolio, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "assessments[0] contains a measurement outside its scenario contract",
    );
    expect(assessment.errors).toContain(
      "assessments[0] contains a capacity dimension outside its scenario contract",
    );
    expect(assessment.errors).toContain(
      "assessments[0] contains a budget key outside its scenario contract",
    );
  });

  it("never turns System evidence aggregation into a capacity certification claim", () => {
    const assessment = assessV3CapacityEvidencePortfolio(completePortfolio(), SHA);
    expect(assessment.certificationClaim).toBe(false);
    expect(assessment.qaReviewRequired).toBe(true);
  });
});
