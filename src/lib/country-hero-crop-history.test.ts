import { describe, expect, it } from "vitest";
import { heroCropHistory, initialHeroCropHistory as initial } from "./country-hero-crop-history";

describe("private image crop edit history", () => {
  it("restores prior crops without changing the original state", () => {
    const edited = heroCropHistory(initial, { type: "edit", point: [20, 80] });
    const undone = heroCropHistory(edited, { type: "undo" });
    expect(undone.present).toEqual([50, 50]);
    expect(heroCropHistory(undone, { type: "redo" })).toEqual(edited);
    expect(initial).toEqual({ past: [], present: [50, 50], future: [] });
  });
  it("discards the old redo branch after a new edit", () => {
    const edited = heroCropHistory(initial, { type: "edit", point: [10, 20] });
    const branched = heroCropHistory(heroCropHistory(edited, { type: "undo" }), { type: "edit", point: [90, 70] });
    expect(branched.future).toEqual([]);
    expect(heroCropHistory(branched, { type: "redo" })).toBe(branched);
  });
  it("bounds memory for long slider interactions", () => {
    let history = initial;
    for (let i = 0; i < 200; i++) history = heroCropHistory(history, { type: "edit", point: [i % 100, i % 80] });
    expect(history.past).toHaveLength(50);
  });
  it("rejects nonfinite values, clamps coordinates and ignores unchanged crops", () => {
    expect(heroCropHistory(initial, { type: "edit", point: [NaN, 0] })).toBe(initial);
    expect(heroCropHistory(initial, { type: "edit", point: [0, Infinity] })).toBe(initial);
    expect(heroCropHistory(initial, { type: "edit", point: [-1, 101] }).present).toEqual([0, 100]);
    expect(heroCropHistory(initial, { type: "edit", point: [50, 50] })).toBe(initial);
    expect(heroCropHistory(initial, { type: "undo" })).toBe(initial);
  });
  it("clears all previous image/country edits on reset", () => {
    const edited = heroCropHistory(initial, { type: "edit", point: [1, 2] });
    const reset = heroCropHistory(edited, { type: "reset" });
    expect(reset).toEqual(initial);
    expect(heroCropHistory(reset, { type: "undo" })).toBe(initial);
  });
});
