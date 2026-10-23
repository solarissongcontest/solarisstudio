import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_JURY_SHARE_CERTIFICATION_CATEGORIES,
  V3_JURY_SHARE_REQUIRED_ASSERTIONS,
  assessV3JuryShareCertificationReadiness,
  type V3JuryShareCertificationCategory,
} from "./v3-jury-share-certification";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const ARTIFACT_SHA256 = "c".repeat(64);

function evidence(category: V3JuryShareCertificationCategory) {
  return {
    schemaVersion: 1,
    category,
    candidateSha: SHA,
    passed: true,
    assertions: [...V3_JURY_SHARE_REQUIRED_ASSERTIONS[category]],
    issues: [] as string[],
    source: {
      workflow: `jury-share-${category}`,
      runId: 100,
      runAttempt: 1,
      headSha: SHA,
      artifactSha256: ARTIFACT_SHA256,
    },
    certificationClaim: false,
  };
}

function completeEvidence() {
  return V3_JURY_SHARE_CERTIFICATION_CATEGORIES.map((category) => evidence(category));
}

describe("Jury Share JSC-12 certification readiness", () => {
  it("accepts complete exact-SHA evidence without claiming final V3 certification", () => {
    const result = assessV3JuryShareCertificationReadiness(completeEvidence(), SHA);

    expect(result.passed).toBe(true);
    expect(result.candidateSha).toBe(SHA);
    expect(result.observedCategories).toEqual(V3_JURY_SHARE_CERTIFICATION_CATEGORIES);
    expect(result.missingCategories).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.certificationClaim).toBe(false);
  });

  it("fails closed when a JSC-12 evidence category is missing", () => {
    const values = completeEvidence().filter((item) => item.category !== "mobile_pwa");
    const result = assessV3JuryShareCertificationReadiness(values, SHA);

    expect(result.passed).toBe(false);
    expect(result.missingCategories).toEqual(["mobile_pwa"]);
    expect(result.issues).toContain(
      "missing Jury Share certification evidence category: mobile_pwa",
    );
  });

  it("rejects duplicate categories rather than accepting whichever artifact happened to load last", () => {
    const values = completeEvidence();
    values.push(evidence("focused_integration"));

    const result = assessV3JuryShareCertificationReadiness(values, SHA);

    expect(result.passed).toBe(false);
    expect(result.issues).toContain(
      "duplicate Jury Share evidence category: focused_integration",
    );
  });

  it("rejects stale, failed or unresolved evidence", () => {
    const values = completeEvidence();
    const authorization = values.find((item) => item.category === "authorization_security");
    if (!authorization) throw new Error("authorization fixture missing");

    authorization.candidateSha = OTHER_SHA;
    authorization.source.headSha = OTHER_SHA;
    authorization.passed = false;
    authorization.issues = ["cross-edition rejection did not pass"];

    const result = assessV3JuryShareCertificationReadiness(values, SHA);
    const text = result.issues.join("\n");

    expect(result.passed).toBe(false);
    expect(text).toContain("evidence must report passed=true");
    expect(text).toContain("not exact candidate");
    expect(text).toContain("unresolved issue");
  });

  it("pins the security, correction, visual, mobile and production-isolation assertions from the plan", () => {
    const values = completeEvidence();
    const isolation = values.find((item) => item.category === "production_isolation");
    const correction = values.find((item) => item.category === "result_correction");
    const visual = values.find((item) => item.category === "visual_golden");
    if (!isolation || !correction || !visual) throw new Error("certification fixture missing");

    isolation.assertions = ["local_or_isolated_only"];
    correction.assertions = [];
    visual.assertions = ["default", "edition", "liquid_glass", "typography"];

    const result = assessV3JuryShareCertificationReadiness(values, SHA);
    const text = result.issues.join("\n");

    expect(result.passed).toBe(false);
    expect(text).toContain("production_isolation: missing required assertion hosted_supabase_refused");
    expect(text).toContain(
      "result_correction: missing required assertion published_version_change_invalidates_render",
    );
    expect(text).toContain("visual_golden: missing required assertion safe_area");
  });

  it("requires auditable exact-head CI artifact provenance", () => {
    const values = completeEvidence();
    const exact = values.find((item) => item.category === "exact_sha");
    if (!exact) throw new Error("exact SHA fixture missing");

    exact.source.workflow = "";
    exact.source.runId = 0;
    exact.source.runAttempt = 0;
    exact.source.artifactSha256 = "not-a-digest";

    const result = assessV3JuryShareCertificationReadiness(values, SHA);
    const text = result.issues.join("\n");

    expect(result.passed).toBe(false);
    expect(text).toContain("source workflow must be present");
    expect(text).toContain("source runId must be a positive integer");
    expect(text).toContain("source runAttempt must be a positive integer");
    expect(text).toContain("source artifactSha256 must be a 64-character SHA-256 digest");
  });

  it("keeps the QA command local, evidence-only and fail-closed", () => {
    const source = readFileSync("scripts/check-v3-jury-share-certification.ts", "utf8");

    expect(source).toContain("--require-ready");
    expect(source).toContain("V3_JURY_SHARE_QA_OUTPUT");
    expect(source).toContain("assessV3JuryShareCertificationReadiness");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("curl ");
    expect(source).not.toContain("supabase.co");
  });
});
