import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/check-v3-release-integrity.ts", "utf8");

describe("V3 exact-candidate release evidence semantics", () => {
  it("rejects SHA-correct S14 evidence that did not actually pass", () => {
    expect(source).toContain('filename === "s14-full-contest.json" && evidence.passed !== true');
  });

  it("rejects SHA-correct S15 evidence with remaining orphans", () => {
    expect(source).toContain('filename === "s15-zero-orphan.json" && evidence.zeroOrphans !== true');
  });

  it("rejects security evidence while any classified finding remains release-blocking", () => {
    expect(source).toContain('filename === "security-advisor-classification.json" && evidence.releaseReady !== true');
  });

  it("requires affirmative exact-SHA S16 mutation-authority evidence for release certification", () => {
    expect(source).toContain('"s16-mutation-authority.json"');
    expect(source).toContain('filename === "s16-mutation-authority.json" && evidence.s16Passed !== true');
    expect(source).toContain("const strictRelease = process.argv.includes(\"--release\") || finalCertification");
    expect(source).toContain("strictRelease && (releaseRiskBlockers.length || certificationBlockers.length)");
  });
});
