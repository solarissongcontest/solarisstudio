import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const assessor = readFileSync(
  resolve(process.cwd(), "src/lib/v3-capacity-rehearsal-plan.ts"),
  "utf8",
);
const cli = readFileSync(
  resolve(process.cwd(), "scripts/check-v3-capacity-rehearsal-plan.ts"),
  "utf8",
);
const runbook = readFileSync(
  resolve(process.cwd(), "docs/runbooks/capacity-rehearsal-plan.md"),
  "utf8",
);

describe("System V3 S12 capacity rehearsal-plan source contract", () => {
  it("derives completeness from the canonical scenario registry instead of copying scenario truth", () => {
    expect(assessor).toContain(
      'import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios"',
    );
    expect(assessor).toContain(
      "V3_CAPACITY_SCENARIOS.map((scenario) => scenario.id)",
    );
    expect(assessor).toContain("missingScenarioIds");
    expect(assessor).toContain('status = "scenario_incomplete"');
  });

  it("binds plans to one exact candidate and a reviewed isolated environment", () => {
    expect(assessor).toContain(
      "capacity rehearsal plan candidateSha does not match expected commit SHA",
    );
    expect(assessor).toContain(
      'plan?.environment !== "local-isolated"',
    );
    expect(assessor).toContain(
      'approval.status !== "approved_for_isolated_rehearsal"',
    );
    expect(assessor).toContain(
      "capacity rehearsal plan approval cannot predate preparedAt",
    );
    expect(assessor).toContain(
      'plan?.productionTrafficAllowed !== false',
    );
    expect(assessor).toContain('plan?.certificationClaim !== false');
    expect(assessor).toContain('plan?.qaReviewRequired !== true');
  });

  it("does not let a plan choose network authority or carry runtime credentials/payloads", () => {
    expect(assessor).toContain('"targetPath"');
    expect(assessor).not.toContain('"baseUrl"');
    expect(assessor).not.toContain('"headers"');
    expect(assessor).not.toContain('"body"');
    expect(assessor).not.toContain('"token"');
    expect(assessor).toContain("assertOnlyKeys(run, RUN_KEYS, runLabel, errors)");
    expect(assessor).toContain('normalized.startsWith("//")');
    expect(assessor).toContain('normalized.includes("://")');
    expect(assessor).toContain('normalized.includes("?")');
    expect(assessor).toContain('normalized.includes("#")');
    expect(assessor).toContain('normalized.includes("%")');
    expect(assessor).toContain('segment === "." || segment === ".."');
    expect(runbook).toContain("relative route path only");
    expect(runbook).toContain("authorization tokens");
    expect(runbook).toContain("request bodies or ballot/participant payloads");
  });

  it("requires explicit load-shape provenance and refuses exploratory release readiness", () => {
    expect(assessor).toContain('"production-telemetry"');
    expect(assessor).toContain('"contest-participation-or-audience"');
    expect(assessor).toContain('"provider-constraint"');
    expect(assessor).toContain('"historical-peak"');
    expect(assessor).toContain('"approved-forecast"');
    expect(assessor).toContain('"explicit-rehearsal-plan"');
    expect(assessor).toContain('"exploratory"');
    expect(assessor).toContain(
      "evidenceRef cannot circularly reference the plan itself",
    );
    expect(assessor).toContain('status = "exploratory_only"');
    expect(assessor).toContain('status = "ready_for_execution_review"');
  });

  it("validates explicit run inputs without embedding operational load defaults", () => {
    expect(assessor).toContain("run.requests");
    expect(assessor).toContain("run.concurrency");
    expect(assessor).toContain("run.databaseSampleIntervalMs");
    expect(assessor).toContain("concurrency cannot exceed requests");
    expect(runbook).toContain(
      "no example request counts, concurrency values or sampling intervals in this runbook",
    );
    expect(runbook).not.toMatch(/V3_CAPACITY_REQUESTS=\d+/);
    expect(runbook).not.toMatch(/V3_CAPACITY_CONCURRENCY=\d+/);
    expect(runbook).not.toMatch(/V3_CAPACITY_DB_SAMPLE_MS=\d+/);
  });

  it("keeps the checker offline, local-file-only and fail-closed", () => {
    expect(cli).toContain("readFileSync");
    expect(cli).toContain("writeFileSync");
    expect(cli).toContain("mkdirSync");
    expect(cli).toContain("assessV3CapacityRehearsalPlan");
    expect(cli).toContain('case "--plan"');
    expect(cli).toContain('case "--expected-sha"');
    expect(cli).toContain('case "--output"');
    expect(cli).toContain('case "--require-ready"');
    expect(cli).toContain(
      'assessment.status !== "ready_for_execution_review"',
    );
    expect(cli).not.toMatch(/\bfetch\s*\(/);
    expect(cli).not.toMatch(/\bhttps?:\/\//i);
    expect(cli).not.toMatch(/\bsupabase\b/i);
    expect(cli).not.toMatch(/\bwrangler\b/i);
    expect(cli).not.toMatch(/child_process|\bexec(File)?\b|\bspawn\b/);
  });

  it("keeps plan approval separate from execution evidence and release certification", () => {
    expect(runbook).toContain(
      "permission to review an isolated execution",
    );
    expect(runbook).toContain(
      "does not generate traffic, start Supabase, contact a provider, derive production budgets, or certify capacity",
    );
    expect(runbook).toContain(
      ".github/scripts/v3-s12-local-capacity-rehearsal.mjs",
    );
    expect(runbook).toContain("src/lib/v3-capacity-evidence.ts");
    expect(runbook).toContain("src/lib/v3-capacity-portfolio.ts");
    expect(runbook).toContain("productionTrafficAllowed: false");
    expect(runbook).toContain("certificationClaim: false");
    expect(runbook).toContain("qaReviewRequired: true");
  });
});
