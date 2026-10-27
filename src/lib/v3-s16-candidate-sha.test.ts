import { describe, expect, it } from "vitest";
import { resolveS16CandidateSha } from "./v3-s16-candidate-sha";
const actual = "a".repeat(40);
const other = "b".repeat(40);
describe("S16 exact checkout evidence identity", () => {
  it("uses the actual checkout when no CI label is supplied", () => {
    expect(resolveS16CandidateSha(actual)).toBe(actual);
  });
  it("rejects stale candidates and synthetic merge SHAs", () => {
    expect(() => resolveS16CandidateSha(actual, other)).toThrow("does not match");
    expect(() => resolveS16CandidateSha(actual, undefined, other)).toThrow("does not match");
  });
  it("permits an explicit exact PR head over the CI merge label", () => {
    expect(resolveS16CandidateSha(actual, actual, other)).toBe(actual);
  });
  it("rejects invalid identities and normalizes hexadecimal case", () => {
    expect(() => resolveS16CandidateSha("main")).toThrow("Invalid");
    expect(() => resolveS16CandidateSha(actual, "main")).toThrow("does not match");
    expect(resolveS16CandidateSha(actual.toUpperCase(), actual)).toBe(actual);
  });
});
