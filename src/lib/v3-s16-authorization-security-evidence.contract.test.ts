import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readiness = readFileSync("src/lib/v3-s16-authorization-readiness.ts", "utf8");
const builder = readFileSync("scripts/build-v3-s16-authorization-security-evidence.ts", "utf8");

describe("S16 authorization/security evidence", () => {
  it("fails authorization readiness while any canonical mutation remains merely declared", () => {
    expect(readiness).toContain('item.state !== "verified"');
    expect(readiness).toContain("declared.length === 0");
    expect(readiness).toContain("V3_AUTHORIZATION_KNOWN_GAPS.length === 0");
    expect(readiness).toContain("validateV3AuthorizationRequirementRegistry");
  });

  it("requires hostile-path evidence on every verified command through the canonical readiness assessment", () => {
    expect(readiness).toContain("item.negativePaths.length < 3");
    expect(readiness).toContain("item.evidence.length === 0");
    expect(builder).toContain("assessV3S16AuthorizationReadiness");
    expect(builder).toContain("const authorization = assessV3S16AuthorizationReadiness()");
  });

  it("binds the category to the literal checked-out candidate SHA", () => {
    expect(builder).toContain("V3_CANDIDATE_SHA must be one exact 40-character Git commit SHA");
    expect(builder).toContain("does not match checked-out SHA");
    expect(builder).toContain("candidateSha");
  });

  it("reuses the canonical security-advisor classification instead of inventing a second security truth", () => {
    expect(builder).toContain('"security-advisor-classification.json"');
    expect(builder).toContain("security.releaseReady === true");
    expect(builder).toContain("securitySha === candidateSha");
  });

  it("writes a diagnostic artifact but cannot pass unless authorization and security are both green", () => {
    expect(builder).toContain("authorization.ready && securityClassificationExactSha && securityReleaseReady");
    expect(builder).toContain('"s16-authorization-security.json"');
    expect(builder).toContain('process.argv.includes("--require-passed")');
  });

  it("does not access hosted Supabase itself", () => {
    expect(builder).not.toContain("supabase.co");
    expect(readiness).not.toContain("supabase.co");
  });
});
