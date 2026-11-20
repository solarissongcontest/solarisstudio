import { describe, expect, it } from "vitest";
import { selectionKeyboardTarget } from "./selection-keyboard";

describe("horizontal selection keyboard navigation", () => {
  const options = [{}, { disabled: true }, {}, {}];
  it("skips disabled choices, wraps and supports both directions", () => {
    expect(selectionKeyboardTarget(options, 0, "ArrowRight")).toBe(2);
    expect(selectionKeyboardTarget(options, 2, "ArrowLeft")).toBe(0);
    expect(selectionKeyboardTarget(options, 3, "ArrowRight")).toBe(0);
    expect(selectionKeyboardTarget(options, 0, "ArrowLeft")).toBe(3);
  });
  it("reverses arrow navigation for RTL without reversing Home and End", () => {
    expect(selectionKeyboardTarget(options, 0, "ArrowLeft", true)).toBe(2);
    expect(selectionKeyboardTarget(options, 2, "ArrowRight", true)).toBe(0);
    expect(selectionKeyboardTarget(options, 2, "Home", true)).toBe(0);
    expect(selectionKeyboardTarget(options, 0, "End", true)).toBe(3);
  });
  it("never captures Tab, activation keys or vertical page scrolling", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "Escape"]) {
      expect(selectionKeyboardTarget(options, 0, key)).toBeNull();
    }
  });
  it("handles empty, all-disabled and single-enabled collections", () => {
    expect(selectionKeyboardTarget([], 0, "Home")).toBeNull();
    expect(selectionKeyboardTarget([{ disabled: true }], 0, "ArrowRight")).toBeNull();
    expect(selectionKeyboardTarget([{ disabled: true }, {}], 1, "ArrowRight")).toBe(1);
    expect(selectionKeyboardTarget(options, -1, "ArrowRight")).toBe(0);
  });
});
