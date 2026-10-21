import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/check-v3-s16-readiness.ts", "utf8");

describe("S16 readiness diagnostic", () => {
  it("enumerates the canonical certification categories rather than maintaining a second list", () => {
    expect(source).toContain("V3_S16_CERTIFICATION_CATEGORIES.map");
    expect(source).toContain("validateV3S16CategorySourceEvidence");
  });

  it("reports exact-candidate artifact presence and semantic blockers", () => {
    expect(source).toContain("candidateValid");
    expect(source).toContain("missing exact-candidate evidence");
    expect(source).toContain("passedCount");
    expect(source).toContain("evidenceDirectory");
  });

  it("surfaces current static authorization, Public and Organizer blockers", () => {
    expect(source).toContain("assessV3S16AuthorizationReadiness");
    expect(source).toContain("publicCutoverRemaining");
    expect(source).toContain("organizerCutoverRemaining");
    expect(source).toContain("authorizationDeclaredCount");
    expect(source).toContain("authorizationIncompleteVerifiedCount");
  });

  it("fails final readiness while any static release blocker remains", () => {
    expect(source).toContain("const staticBlockersClear =");
    expect(source).toContain("authorization.ready && publicRemaining.length === 0 && organizerRemaining.length === 0");
    expect(source).toContain("passedCount === categories.length &&");
    expect(source).toContain("staticBlockersClear");
    expect(source).toContain("if (requireReady && !result.ready) process.exit(1)");
  });

  it("reports the canonical required surface-case counts", () => {
    expect(source).toContain("requiredV3S16PublicAcceptanceCases");
    expect(source).toContain("requiredV3S16OrganizerAcceptanceCases");
    expect(source).toContain("V3_S16_NAVIGATION_REQUIRED_CASES.length");
    expect(source).toContain("V3_S16_ACCESSIBILITY_REQUIRED_CASES.length");
    expect(source).toContain("V3_S16_RESPONSIVE_REQUIRED_CASES.length");
  });

  it("is diagnostic by default but can enforce final readiness", () => {
    expect(source).toContain('process.argv.includes("--require-ready")');
    expect(source).toContain("if (requireReady && !result.ready) process.exit(1)");
  });

  it("does not contact hosted services", () => {
    expect(source).not.toContain("supabase.co");
    expect(source).not.toContain("api.github.com");
  });
});
