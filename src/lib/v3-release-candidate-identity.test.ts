import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { resolveV3ReleaseCandidateIdentity } from "../../scripts/v3-release-candidate-identity";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);

describe("V3 exact-SHA release candidate identity", () => {
  it("accepts and normalizes a verified exact checked-out HEAD", () => {
    expect(resolveV3ReleaseCandidateIdentity({
      checkedOutSha: `  ${HEAD.toUpperCase()}  `,
      requestedCandidateSha: ` ${HEAD} `,
      strictRelease: true,
    })).toMatchObject({
      checkedOutSha: HEAD,
      requestedCandidateSha: HEAD,
      evidenceCandidateSha: HEAD,
      errors: [],
    });
  });

  it("uses exact Git HEAD when no candidate was supplied", () => {
    expect(resolveV3ReleaseCandidateIdentity({
      checkedOutSha: HEAD,
      requestedCandidateSha: null,
      strictRelease: true,
    })).toMatchObject({ evidenceCandidateSha: HEAD, errors: [] });
  });

  it("rejects a mismatched candidate instead of selecting either revision", () => {
    const result = resolveV3ReleaseCandidateIdentity({
      checkedOutSha: HEAD,
      requestedCandidateSha: OTHER,
      strictRelease: true,
    });
    expect(result.evidenceCandidateSha).toBeNull();
    expect(result.errors.join(" ")).toContain("does not match checked-out SHA");
  });

  it.each(["abc", "g".repeat(40), "a".repeat(39), "a".repeat(41)])(
    "rejects malformed V3_CANDIDATE_SHA %s even in ordinary structural checks",
    (candidate) => {
      const result = resolveV3ReleaseCandidateIdentity({
        checkedOutSha: HEAD,
        requestedCandidateSha: candidate,
        strictRelease: false,
      });
      expect(result.evidenceCandidateSha).toBeNull();
      expect(result.errors.join(" ")).toContain("V3_CANDIDATE_SHA is not an exact");
    },
  );

  it("rejects malformed checked-out Git HEAD", () => {
    const result = resolveV3ReleaseCandidateIdentity({
      checkedOutSha: "not-a-git-revision",
      requestedCandidateSha: null,
      strictRelease: true,
    });
    expect(result.evidenceCandidateSha).toBeNull();
    expect(result.errors.join(" ")).toContain("checked-out Git HEAD is not an exact");
  });

  it.each([false, true])(
    "does not allow an environment candidate to replace missing Git evidence (strict=%s)",
    (strictRelease) => {
      const result = resolveV3ReleaseCandidateIdentity({
        checkedOutSha: null,
        requestedCandidateSha: HEAD,
        strictRelease,
      });
      expect(result.evidenceCandidateSha).toBeNull();
      expect(result.errors.join(" ")).toContain("cannot verify checked-out Git HEAD");
    },
  );

  it("fails closed when release certification cannot inspect Git HEAD", () => {
    const result = resolveV3ReleaseCandidateIdentity({
      checkedOutSha: null,
      requestedCandidateSha: null,
      strictRelease: true,
    });
    expect(result.evidenceCandidateSha).toBeNull();
    expect(result.errors.join(" ")).toContain("cannot verify checked-out Git HEAD");
  });

  it("permits diagnostics without Git but cannot produce a candidate identity", () => {
    expect(resolveV3ReleaseCandidateIdentity({
      checkedOutSha: null,
      requestedCandidateSha: null,
      strictRelease: false,
    })).toMatchObject({ evidenceCandidateSha: null, errors: [] });
  });

  it("is enforced by the actual release-integrity command", () => {
    const checker = readFileSync("scripts/check-v3-release-integrity.ts", "utf8");
    expect(checker).toContain("resolveV3ReleaseCandidateIdentity({");
    expect(checker).toContain("strictRelease,");
    expect(checker).toContain("errors.push(...identity.errors)");
    expect(checker).toContain("const evidenceCandidateSha = identity.evidenceCandidateSha");
  });
});
