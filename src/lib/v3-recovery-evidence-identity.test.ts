import { describe, expect, it } from "vitest";
import { verifyV3RecoveryEvidenceCommit } from "./v3-recovery-evidence-identity";

const head = "73d3c5289b5b105ccaddbc6ccd2c76304316a4d9";
const other = "544cd21cbaaf73c4a2f7368e1a2dadf5db509c3e";

describe("S11 recovery evidence exact-checkout identity", () => {
  it("returns the actual checkout identity for the matching candidate", () => {
    expect(verifyV3RecoveryEvidenceCommit(head, head)).toBe(head);
  });

  it("normalizes uppercase SHA and surrounding whitespace", () => {
    expect(verifyV3RecoveryEvidenceCommit(` ${head.toUpperCase()} `, `\n${head}\n`)).toBe(head);
  });

  it("rejects a valid but stale or foreign candidate SHA", () => {
    expect(() => verifyV3RecoveryEvidenceCommit(other, head)).toThrow(/does not match checked-out HEAD/);
  });

  it("rejects a malformed supplied SHA instead of minting misleading evidence", () => {
    for (const value of ["", "main", "73d3c528", "z".repeat(40)]) {
      expect(() => verifyV3RecoveryEvidenceCommit(value, head)).toThrow(/exact 40-character/);
    }
  });

  it("rejects missing or malformed checkout evidence even with a valid candidate", () => {
    for (const value of ["", "HEAD", "f".repeat(39)]) {
      expect(() => verifyV3RecoveryEvidenceCommit(head, value)).toThrow(/cannot verify/);
    }
  });
});
