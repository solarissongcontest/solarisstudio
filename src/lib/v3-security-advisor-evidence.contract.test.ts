import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/build-v3-security-advisor-classification.ts", "utf8");

describe("V3 security advisor release evidence", () => {
  it("binds evidence to the exact checked-out candidate", () => {
    expect(source).toContain('execFileSync("git", ["rev-parse", "HEAD"]');
    expect(source).toContain("candidateSha !== head");
    expect(source).toContain("V3_CANDIDATE_SHA");
    expect(source).toContain("candidateSha,");
  });

  it("requires every live advisor finding to receive exactly one explicit disposition", () => {
    expect(source).toContain("unclassified advisor findings");
    expect(source).toContain("duplicate disposition");
    expect(source).toContain("disposition references absent finding");
    expect(source).toContain("duplicate advisor finding id");
  });

  it("allows only the canonical QA disposition vocabulary", () => {
    expect(source).toContain('"intentional-and-proven"');
    expect(source).toContain('"remediated"');
    expect(source).toContain('"release-blocking"');
    expect(source).toContain("allowedStatuses");
  });

  it("requires durable proof and explanation rather than blanket waivers", () => {
    expect(source).toContain("requires durable evidenceRef");
    expect(source).toContain("requires a reason");
    expect(source).toContain("releaseBlocking");
    expect(source).toContain("--require-release-ready");
  });

  it("binds the classification to the same Supabase project as the advisor snapshot", () => {
    expect(source).toContain("snapshot.projectRef !== dispositions.projectRef");
    expect(source).toContain("projectRef: snapshot.projectRef");
  });
});
