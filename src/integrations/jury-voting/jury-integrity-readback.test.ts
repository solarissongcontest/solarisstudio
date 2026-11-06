import { describe, expect, it } from "vitest";
import { assertCompleteJuryIntegrityReadback, assertJuryIntegrityV5Evidence, numberValue, percentageValue, peerCountValue, proportionValue } from "./jury-integrity-readback";

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

describe("Jury Integrity v5 evidence version coherence", () => {
  const stored = { risk: 64, confidence: 78 };
  const matching = { modelVersion: "jury-integrity-model-v5", risk: 64, confidence: 78 };

  it("accepts matching model, risk and confidence", () => {
    expect(() => assertJuryIntegrityV5Evidence(stored, matching)).not.toThrow();
  });

  it.each([
    { modelVersion: "jury-integrity-model-v4", risk: 64, confidence: 78 },
    { modelVersion: null, risk: 64, confidence: 78 },
    { modelVersion: "jury-integrity-model-v5", risk: 50, confidence: 78 },
    { modelVersion: "jury-integrity-model-v5", risk: 64, confidence: 50 },
    { modelVersion: "jury-integrity-model-v5", risk: null, confidence: 78 },
  ])("rejects stale/mixed/corrupt evidence %o", (evidence) => {
    expect(() => assertJuryIntegrityV5Evidence(stored, evidence)).toThrow();
  });
});

describe("Jury Integrity bounded edition-wide completeness", () => {
  it.each([[0, 0], [1, 1], [37, 37], [1000, 1000]])(
    "accepts a complete %s-row readback",
    (exact, received) => expect(() => assertCompleteJuryIntegrityReadback(exact, received)).not.toThrow(),
  );

  it.each([
    [null, 0], [undefined, 0], ["1", 1], [1, 0], [1001, 1000],
    [1000, 999], [999, 1000], [1001, 1001], [-1, 0],
    [Number.NaN, 0], [1.5, 1], [0, -1], [0, 0.5],
  ])("rejects unverifiable or truncated readback count %s / rows %s", (exact, received) => {
    expect(() => assertCompleteJuryIntegrityReadback(exact, received)).toThrow(
      "Jury integrity evidence is incomplete",
    );
  });
});
