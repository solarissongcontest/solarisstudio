import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_S11_FULL_SERVICE_CHECKS,
  V3_S11_RECOVERY_COMPONENTS,
} from "./v3-full-service-recovery-evidence";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const assessor = source("src/lib/v3-full-service-recovery-evidence.ts");
const generator = source("scripts/generate-v3-full-service-recovery-evidence.ts");
const runbook = source("docs/runbooks/full-service-recovery.md");

describe("System V3 S11 full-service recovery composition", () => {
  it("requires every independently owned recovery component", () => {
    expect(V3_S11_RECOVERY_COMPONENTS).toEqual([
      "database",
      "storage",
      "deployment",
    ]);
    for (const component of V3_S11_RECOVERY_COMPONENTS) {
      expect(runbook).toContain(component === "storage" ? "Storage object-byte recovery" : component);
    }
    expect(assessor).toContain("component_evidence_incomplete");
    expect(assessor).toContain("ready_for_qa_review");
  });

  it("requires explicit cross-layer end-to-end recovery checks", () => {
    expect(V3_S11_FULL_SERVICE_CHECKS).toEqual([
      "databaseStorageIdentity",
      "schemaApplicationCompatibility",
      "canonicalIntegrity",
      "publicationIntegrity",
      "authAuthorization",
      "criticalParticipantFlows",
      "reconciliationHealthy",
      "storagePrivacy",
      "runtimeCandidateExact",
      "postCutoverVerification",
    ]);
    expect(runbook).toContain("end-to-end isolated rehearsal");
    expect(runbook).toContain("post-cutover verification");
  });

  it("keeps production and provider claims fail closed", () => {
    for (const field of [
      "productionTouched",
      "productionSupabaseTraffic",
      "destructiveProductionRestore",
      "providerRpoClaim",
      "providerRtoClaim",
      "certificationClaim",
    ]) {
      expect(assessor).toContain(field);
    }
    expect(runbook).toContain("Automated testing must not connect to hosted production Supabase");
    expect(runbook).toContain("never permission to fall back to production");
    expect(runbook).toContain("certificationClaim: false");
  });

  it("provides a deterministic no-network readiness command", () => {
    expect(generator).toContain("readFileSync");
    expect(generator).toContain("assessV3FullServiceRecoveryEvidence");
    expect(generator).toContain("--expected-sha");
    expect(generator).toContain("--require-ready");
    expect(generator).not.toMatch(/fetch\s*\(/);
    expect(generator).not.toContain("supabase");
    expect(generator).not.toContain("wrangler");
    expect(runbook).toContain("generate-v3-full-service-recovery-evidence.ts");
  });

  it("does not mark the repository as S11 certified merely because composition code exists", () => {
    expect(runbook).toContain("S11 remains incomplete");
    expect(runbook).not.toContain("S11 certified");
    expect(assessor).toContain("qaReviewRequired: true");
    expect(assessor).toContain("certificationClaim: false");
  });
});
