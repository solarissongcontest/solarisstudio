import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readV3CapacityAssessmentArtifact,
  unwrapV3CapacityAssessmentArtifact,
} from "../../scripts/generate-v3-capacity-portfolio";
import { assessV3CapacityEvidencePortfolio } from "./v3-capacity-portfolio";
import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";

const generator = readFileSync(
  resolve(process.cwd(), "scripts/generate-v3-capacity-portfolio.ts"),
  "utf8",
);
const scenarioGenerator = readFileSync(
  resolve(process.cwd(), "scripts/generate-v3-capacity-evidence.ts"),
  "utf8",
);
const runbook = readFileSync(
  resolve(process.cwd(), "docs/runbooks/capacity-portfolio.md"),
  "utf8",
);

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

describe("System V3 S12 capacity portfolio operational contract", () => {
  it("aggregates artifacts only and never generates production or hosted load", () => {
    expect(generator).toContain("readFileSync");
    expect(generator).toContain("assessV3CapacityEvidencePortfolio");
    expect(generator).not.toContain("fetch(");
    expect(generator).not.toContain("http://");
    expect(generator).not.toContain("https://");
    expect(generator).not.toContain("supabase.co");
    expect(runbook).toContain("performs no load generation and no network traffic");
    expect(runbook).toContain("Production Supabase is not a capacity-test target");
  });

  it("requires exact-SHA evidence rather than mixing historical capacity results", () => {
    expect(generator).toContain("<exact-commit-sha>");
    expect(runbook).toContain("exact 40-character candidate commit SHA");
    expect(runbook).toContain("same exact SHA");
    expect(runbook).toContain("If the candidate SHA changes");
  });

  it("documents every canonical S12 scenario in the portfolio command", () => {
    for (const scenario of V3_CAPACITY_SCENARIOS) {
      expect(runbook).toContain(`${scenario.id}.assessment.json`);
    }
  });

  it("consumes the exact producer envelope instead of passing it to the portfolio assessor", () => {
    expect(scenarioGenerator).toContain("generatedAt: new Date().toISOString()");
    expect(scenarioGenerator).toContain("assessment,");
    expect(generator).toContain("unwrapV3CapacityAssessmentArtifact");
    expect(generator).toContain("return record.assessment");

    const producerOutputs = V3_CAPACITY_SCENARIOS.map((scenario) => ({
      generatedAt: "2026-10-24T17:00:00.000Z",
      assessment: readyAssessment(scenario.id),
    }));
    const unwrapped = producerOutputs.map((artifact, index) =>
      unwrapV3CapacityAssessmentArtifact(artifact, `producer[${index}]`),
    );
    const portfolio = assessV3CapacityEvidencePortfolio(unwrapped, SHA);

    expect(portfolio.status).toBe("ready_for_qa_review");
    expect(portfolio.readyScenarioCount).toBe(V3_CAPACITY_SCENARIOS.length);
    expect(portfolio.errors).toEqual([]);
  });

  it("fails closed on malformed producer envelopes instead of treating them as raw assessments", () => {
    expect(() =>
      unwrapV3CapacityAssessmentArtifact(
        { generatedAt: "not-a-time", assessment: readyAssessment(V3_CAPACITY_SCENARIOS[0].id) },
        "bad-time.json",
      ),
    ).toThrow("invalid generatedAt timestamp");
    expect(() =>
      unwrapV3CapacityAssessmentArtifact(
        { generatedAt: "2026-10-24T17:00:00.000Z" },
        "missing-assessment.json",
      ),
    ).toThrow("must contain an assessment object");
    expect(() =>
      unwrapV3CapacityAssessmentArtifact(
        { assessment: readyAssessment(V3_CAPACITY_SCENARIOS[0].id) },
        "missing-time.json",
      ),
    ).toThrow("invalid generatedAt timestamp");
  });

  it("keeps direct assessment JSON explicitly compatible for retained historical evidence", () => {
    const raw = readyAssessment(V3_CAPACITY_SCENARIOS[0].id);
    expect(unwrapV3CapacityAssessmentArtifact(raw, "legacy.json")).toBe(raw);
  });

  it("exports the file loader used by the CLI rather than duplicating envelope handling", () => {
    expect(typeof readV3CapacityAssessmentArtifact).toBe("function");
    expect(generator).toContain("return readV3CapacityAssessmentArtifact(path)");
  });

  it("fails closed when a child status contradicts its evidence", () => {
    expect(runbook).toContain(
      "A child whose declared status contradicts its unresolved evidence also fails closed.",
    );
  });

  it("keeps System review readiness separate from QA/release certification", () => {
    expect(runbook).toContain("not a release certification");
    expect(runbook).toContain("Chat 5 / release certification retains the final capacity gate");
    expect(runbook).toContain("no child assessment claims release certification");
    expect(generator).toContain("V3_CAPACITY_REQUIRE_PORTFOLIO_REVIEW_READY");
  });
});
