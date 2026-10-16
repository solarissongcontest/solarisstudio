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

  it("requires an affirmative S16 certificate only in final certification mode", () => {
    expect(source).toContain('filename === "s16-certification.json" && evidence.certified !== true');
    expect(source).toContain('finalCertification ? [...releasePrerequisiteEvidence, "s16-certification.json"]');
  });
});
