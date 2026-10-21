import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_S16_CERTIFICATION_CATEGORIES,
  validateV3S16CertificationEvidence,
  type V3S16CertificationEvidence,
} from "./v3-s16-certification-contract";

const SHA = "a".repeat(40);

function completeEvidence(): V3S16CertificationEvidence {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    certified: true,
    categories: V3_S16_CERTIFICATION_CATEGORIES.map((category) => ({
      id: category.id,
      evidenceFilename: category.evidenceFilename,
      evidenceCandidateSha: SHA,
      passed: true,
    })),
  };
}

describe("V3 S16 exact-SHA certification contract", () => {
  it("contains every canonical Session-5 certification category exactly once", () => {
    expect(V3_S16_CERTIFICATION_CATEGORIES.map((category) => category.id)).toEqual([
      "canonical-ci",
      "migration-rehearsal",
      "authorization-security",
      "production-isolation",
      "public-acceptance",
      "organizer-acceptance",
      "navigation-acceptance",
      "accessibility",
      "responsive-behavior",
      "full-contest-rehearsal",
      "registry-zero-gap",
    ]);
    expect(new Set(V3_S16_CERTIFICATION_CATEGORIES.map((category) => category.id)).size).toBe(11);
  });

  it("accepts a complete certificate only when all 11 categories prove the exact candidate", () => {
    expect(validateV3S16CertificationEvidence(completeEvidence(), SHA)).toEqual([]);
  });

  it("rejects the former forged-certificate shape containing only certified=true", () => {
    const issues = validateV3S16CertificationEvidence(
      { schemaVersion: 1, candidateSha: SHA, certified: true },
      SHA,
    );
    expect(issues).toContain("S16 certification categories must be an array");
  });

  it("rejects missing, duplicate and unknown categories", () => {
    const evidence = completeEvidence();
    evidence.categories = [
      ...evidence.categories.slice(1),
      evidence.categories[1]!,
      {
        id: "invented-category" as never,
        evidenceFilename: "invented.json",
        evidenceCandidateSha: SHA,
        passed: true,
      },
    ];
    const issues = validateV3S16CertificationEvidence(evidence, SHA);
    expect(issues.some((issue) => issue.includes("exactly one canonical-ci category"))).toBe(true);
    expect(issues.some((issue) => issue.includes("exactly one migration-rehearsal category"))).toBe(true);
    expect(issues).toContain("S16 certification contains unknown category: invented-category");
  });

  it("rejects stale category evidence even when the top-level certificate SHA is current", () => {
    const evidence = completeEvidence();
    evidence.categories[0]!.evidenceCandidateSha = "b".repeat(40);
    const issues = validateV3S16CertificationEvidence(evidence, SHA);
    expect(issues.some((issue) => issue.includes("canonical-ci certifies"))).toBe(true);
  });

  it("rejects a category that is present but not passing", () => {
    const evidence = completeEvidence();
    evidence.categories[4]!.passed = false;
    expect(validateV3S16CertificationEvidence(evidence, SHA)).toContain(
      "S16 public-acceptance category does not prove passed=true",
    );
  });

  it("keeps the builder fail-closed, exact-checkout-bound and blocked by static release state", () => {
    const builder = readFileSync("scripts/build-v3-s16-certification.ts", "utf8");
    expect(builder).toContain("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
    expect(builder).toContain("does not match checked-out SHA");
    expect(builder).toContain("assessV3S16AuthorizationReadiness");
    expect(builder).toContain("publicRemaining");
    expect(builder).toContain("organizerRemaining");
    expect(builder).toContain("staticBlockers");
    expect(builder).toContain("const allCategoriesPassed = categories.every((category) => category.passed)");
    expect(builder).toContain("const certified = allCategoriesPassed && staticBlockers.length === 0");
    expect(builder).toContain('process.argv.includes("--require-certified")');
    expect(builder).not.toContain("supabase.co");
  });

  it("makes release integrity semantically validate S16 instead of trusting one boolean", () => {
    const guard = readFileSync("scripts/check-v3-release-integrity.ts", "utf8");
    expect(guard).toContain("validateV3S16CertificationEvidence");
    expect(guard).not.toContain(
      'filename === "s16-certification.json" && evidence.certified !== true',
    );
  });
});
