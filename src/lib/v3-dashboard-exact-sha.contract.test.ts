import { describe, expect, it } from "vitest";
import { resolveDashboardExactSha } from "../../scripts/v3-dashboard-exact-sha";

const A = "a".repeat(40);
const B = "b".repeat(40);

describe("V3 completion-dashboard candidate identity", () => {
  it("uses the verified checkout rather than an unverified workflow context", () => {
    expect(resolveDashboardExactSha(A, undefined)).toBe(A);
    expect(resolveDashboardExactSha(A.toUpperCase(), A)).toBe(A);
    expect(resolveDashboardExactSha(A, A.toUpperCase())).toBe(A);
  });

  it("rejects an alternate well-formed GITHUB_SHA", () => {
    expect(() => resolveDashboardExactSha(A, B)).toThrow(/does not match inspected checkout/);
  });

  it("rejects malformed checkout and workflow identities", () => {
    expect(() => resolveDashboardExactSha("not-a-commit", A)).toThrow(/checkout identity/);
    expect(() => resolveDashboardExactSha(A, "invalid")).toThrow(/GITHUB_SHA is invalid/);
  });

  it("cannot pretend to certify a source that was not checked out", () => {
    expect(() => resolveDashboardExactSha(null, A)).toThrow(/without a verified Git checkout/);
    expect(resolveDashboardExactSha(null, undefined)).toBe("unknown");
  });
});
