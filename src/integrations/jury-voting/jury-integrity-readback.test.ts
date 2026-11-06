import { describe, expect, it } from "vitest";
import { numberValue, percentageValue, peerCountValue, proportionValue } from "./jury-integrity-readback";

describe("Jury Integrity v5 numeric readback", () => {
  it.each([0, 1, 12, 0.125, 100, "12", "0.25"])(
    "retains actual numeric evidence: %s",
    (value) => expect(numberValue(value)).toBe(Number(value)),
  );

  it.each([
    null, undefined, "", " ", "NaN", "Infinity", "bad", -1,
    Number.POSITIVE_INFINITY, Number.NaN, true, false, [], {},
  ])("rejects missing or corrupt evidence instead of fabricating a healthy zero: %s", (value) => {
    expect(() => numberValue(value)).toThrow("Jury integrity evidence contains a missing or invalid number");
  });
});

describe("Jury Integrity model-bound evidence values", () => {
  it.each([0, 0.5, 50, 100, "100"])("accepts 0..100 risk/confidence: %s", (value) => {
    expect(percentageValue(value)).toBe(Number(value));
  });

  it.each([-0.1, 100.1, 120, null, Number.POSITIVE_INFINITY])(
    "refuses impossible risk/confidence: %s",
    (value) => expect(() => percentageValue(value)).toThrow(),
  );

  it.each([0, 0.25, 1, "0.875"])(
    "accepts 0..1 normalized proportions: %s",
    (value) => expect(proportionValue(value)).toBe(Number(value)),
  );

  it.each([-0.1, 1.1, 2, null])(
    "refuses invalid normalized proportions: %s",
    (value) => expect(() => proportionValue(value)).toThrow(),
  );

  it.each([0, 1, 3, 100, "6"])(
    "accepts whole peer ballot counts: %s",
    (value) => expect(peerCountValue(value)).toBe(Number(value)),
  );

  it.each([-1, 1.1, 2.5, Number.POSITIVE_INFINITY, ""])(
    "refuses partial or invalid peer ballot counts: %s",
    (value) => expect(() => peerCountValue(value)).toThrow(),
  );
});
