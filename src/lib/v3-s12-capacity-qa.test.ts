import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";
import { assessV3S12CapacityQaEvidence } from "./v3-s12-capacity-qa";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const scenarioCount = V3_CAPACITY_SCENARIOS.length;

function readyPortfolio() {
  return {
    schemaVersion: 1,
    status: "ready_for_qa_review",
    expectedCommitSha: SHA,
    canonicalScenarioCount: scenarioCount,
    observedScenarioCount: scenarioCount,
    readyScenarioCount: scenarioCount,
    missingScenarioIds: [] as string[],
    incompleteScenarioIds: [] as string[],
    invalidScenarioIds: [] as string[],
    missingMeasurements: [] as string[],
    missingExternalEvidenceDimensions: [] as string[],
    missingBudgetKeys: [] as string[],
    errors: [] as string[],
    certificationClaim: false,
    qaReviewRequired: true,
  };
}

describe("S12 capacity QA gate", () => {
  it("accepts only the complete exact-SHA System portfolio", () => {
    const evidence = assessV3S12CapacityQaEvidence(readyPortfolio(), SHA);

    expect(evidence.passed).toBe(true);
    expect(evidence.candidateSha).toBe(SHA);
    expect(evidence.canonicalScenarioCount).toBe(scenarioCount);
    expect(evidence.issues).toEqual([]);
    expect(evidence.certificationClaim).toBe(false);
  });

  it("rejects a portfolio from a different commit", () => {
    const portfolio = readyPortfolio();
    portfolio.expectedCommitSha = OTHER_SHA;

    const evidence = assessV3S12CapacityQaEvidence(portfolio, SHA);

    expect(evidence.passed).toBe(false);
    expect(evidence.issues.join("\n")).toContain("not exact candidate");
  });

  it("rejects incomplete canonical scenario coverage even if status is forged ready", () => {
    const portfolio = readyPortfolio();
    const lastScenario = V3_CAPACITY_SCENARIOS[V3_CAPACITY_SCENARIOS.length - 1];
    portfolio.observedScenarioCount = scenarioCount - 1;
    portfolio.readyScenarioCount = scenarioCount - 1;
    portfolio.missingScenarioIds = [lastScenario?.id ?? "missing"];

    const evidence = assessV3S12CapacityQaEvidence(portfolio, SHA);

    expect(evidence.passed).toBe(false);
    expect(evidence.issues.join("\n")).toContain("observed");
    expect(evidence.issues.join("\n")).toContain("missingScenarioIds");
  });

  it("rejects unresolved measurements, external evidence and budget gaps", () => {
    const portfolio = readyPortfolio();
    portfolio.missingMeasurements = ["request_rate"];
    portfolio.missingExternalEvidenceDimensions = ["database"];
    portfolio.missingBudgetKeys = ["database:normal"];

    const evidence = assessV3S12CapacityQaEvidence(portfolio, SHA);

    expect(evidence.passed).toBe(false);
    expect(evidence.issues).toContain(
      "capacity portfolio missingMeasurements must be an empty array",
    );
    expect(evidence.issues).toContain(
      "capacity portfolio missingExternalEvidenceDimensions must be an empty array",
    );
    expect(evidence.issues).toContain(
      "capacity portfolio missingBudgetKeys must be an empty array",
    );
  });

  it("rejects a System portfolio that tries to claim release certification", () => {
    const portfolio = { ...readyPortfolio(), certificationClaim: true };

    const evidence = assessV3S12CapacityQaEvidence(portfolio, SHA);

    expect(evidence.passed).toBe(false);
    expect(evidence.issues).toContain(
      "System capacity portfolio must not claim release certification",
    );
  });

  it("keeps the QA command local and fail-closed", () => {
    const source = readFileSync("scripts/check-v3-s12-capacity-qa.ts", "utf8");

    expect(source).toContain("--require-ready");
    expect(source).toContain("V3_S12_CAPACITY_QA_OUTPUT");
    expect(source).toContain("assessV3S12CapacityQaEvidence");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("curl ");
    expect(source).not.toContain("supabase.co");
  });
});
