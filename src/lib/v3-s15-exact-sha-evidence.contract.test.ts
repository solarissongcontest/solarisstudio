import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const builder = readFileSync("scripts/build-v3-s15-zero-orphan-evidence.ts", "utf8");
const readiness = readFileSync("scripts/check-v3-s15-zero-orphan-readiness.ts", "utf8");
const releaseIntegrity = readFileSync("scripts/check-v3-release-integrity.ts", "utf8");
const preflight = readFileSync(".github/workflows/v3-release-candidate-preflight.yml", "utf8");

describe("S15 exact-SHA zero-orphan release evidence", () => {
  it("binds evidence to the literal checked-out candidate SHA", () => {
    expect(builder).toContain("V3_CANDIDATE_SHA");
    expect(builder).toContain('git", ["rev-parse", "HEAD"]');
    expect(builder).toContain("must be one exact 40-character Git commit SHA");
    expect(builder).toContain("does not match checked-out SHA");
    expect(builder).toContain("candidateSha: requestedCandidateSha");
  });

  it("derives evidence from the canonical S15 scanner rather than duplicating orphan logic", () => {
    expect(builder).toContain("check-v3-s15-zero-orphan-readiness.ts");
    expect(builder).toContain('"--json"');
    expect(builder).toContain('typeof readiness.zeroOrphans !== "boolean"');
    expect(readiness).toContain("PUBLIC_CUTOVER_UNRESOLVED");
    expect(readiness).toContain("ORGANIZER_CUTOVER_UNRESOLVED");
    expect(readiness).toContain("RUNTIME_API_ROUTE_ORPHAN");
  });

  it("writes the exact release artifact consumed by release integrity", () => {
    expect(builder).toContain('"s15-zero-orphan.json"');
    expect(builder).toContain("V3_RELEASE_EVIDENCE_DIR");
    expect(releaseIntegrity).toContain('"s15-zero-orphan.json"');
    expect(releaseIntegrity).toContain('validateV3S16CategorySourceEvidence');
    expect(releaseIntegrity).toContain('"registry-zero-gap"');
  });

  it("supports fail-closed final enforcement without suppressing diagnostic evidence", () => {
    expect(builder).toContain('process.argv.includes("--require-zero")');
    expect(builder).toContain("if (requireZero && readiness.zeroOrphans !== true) process.exit(1)");
  });

  it("is wired into exact-SHA release preflight", () => {
    expect(preflight).toContain("build-v3-s15-zero-orphan-evidence.ts");
    expect(preflight).toContain("V3_RELEASE_EVIDENCE_DIR=v3-release-preflight");
    expect(preflight).toContain("s15-zero-orphan.json");
  });

  it("does not introduce hosted Supabase access", () => {
    expect(builder).not.toContain("supabase.co");
  });
});
