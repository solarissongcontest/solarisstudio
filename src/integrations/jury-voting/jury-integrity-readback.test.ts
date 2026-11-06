import { describe, expect, it } from "vitest";
import { numberValue } from "./jury-integrity-readback";

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
