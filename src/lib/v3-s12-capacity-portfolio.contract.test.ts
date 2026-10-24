import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";

const generator = readFileSync(
  resolve(process.cwd(), "scripts/generate-v3-capacity-portfolio.ts"),
  "utf8",
);
const runbook = readFileSync(
  resolve(process.cwd(), "docs/runbooks/capacity-portfolio.md"),
  "utf8",
);

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

  it("keeps System review readiness separate from QA/release certification", () => {
    expect(runbook).toContain("not a release certification");
    expect(runbook).toContain("Chat 5 / release certification retains the final capacity gate");
    expect(runbook).toContain("no child assessment claims release certification");
    expect(generator).toContain("V3_CAPACITY_REQUIRE_PORTFOLIO_REVIEW_READY");
  });
});
