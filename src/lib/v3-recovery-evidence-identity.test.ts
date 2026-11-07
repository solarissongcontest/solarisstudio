import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { requireV3RecoveryEvidenceIdentity } from "./v3-recovery-evidence-identity";

const a = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const b = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("S11 exact-checkout recovery evidence identity", () => {
  it("accepts only the exact checkout identity", () => {
    expect(requireV3RecoveryEvidenceIdentity(a, a)).toBe(a);
    expect(requireV3RecoveryEvidenceIdentity(` ${a.toUpperCase()} `, `\n${a} \n`)).toBe(a);
  });

  it("rejects a different but valid requested candidate SHA", () => {
    expect(() => requireV3RecoveryEvidenceIdentity(a, b)).toThrow(/does not match checkout HEAD/);
  });

  it("rejects malformed, short or absent requested identity", () => {
    for (const requested of ["", "abc", "z".repeat(40), "0".repeat(39)]) {
      expect(() => requireV3RecoveryEvidenceIdentity(requested, a)).toThrow(/complete 40-character/);
    }
  });

  it("rejects unverifiable or malformed checked-out HEAD", () => {
    for (const actual of ["", "not-a-git-repository", "1".repeat(39)]) {
      expect(() => requireV3RecoveryEvidenceIdentity(a, actual)).toThrow(/verified 40-character/);
    }
  });

  it("requires the generator to check Git HEAD before emitting any success artifact", () => {
    const generator = readFileSync(
      resolve(process.cwd(), "scripts/generate-v3-recovery-readiness.ts"), "utf8",
    );
    const lookup = generator.indexOf('execFileSync("git", ["rev-parse", "HEAD"]');
    const verification = generator.indexOf("commitSha = requireV3RecoveryEvidenceIdentity(");
    const output = generator.indexOf("const output =");
    const persistence = generator.indexOf("writeFileSync(outputPath,");
    expect(lookup).toBeGreaterThan(-1);
    expect(verification).toBeGreaterThan(lookup);
    expect(output).toBeGreaterThan(verification);
    expect(persistence).toBeGreaterThan(output);
    expect(generator).not.toContain(
      'const commitSha = requiredEnvironment("V3_RECOVERY_EVIDENCE_SHA").toLowerCase()',
    );
  });
});
