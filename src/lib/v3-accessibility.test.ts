import { describe, expect, it } from "vitest";

import { v3AccessibleAnnouncement, v3AccessibleTouchTarget } from "./v3-accessibility";

describe("V3 accessibility policy", () => {
  it("keeps background refresh silent", () => {
    expect(v3AccessibleAnnouncement("background_refresh")).toEqual({
      event: "background_refresh",
      priority: "silent",
      message: null,
      atomic: false,
    });
  });

  it("announces uncertain submissions assertively without claiming failure", () => {
    expect(v3AccessibleAnnouncement("submission_uncertain")).toMatchObject({
      priority: "assertive",
      message: "Checking whether your submission was received",
    });
  });

  it("uses polite announcements for successful submissions and results availability", () => {
    expect(v3AccessibleAnnouncement("submission_confirmed").priority).toBe("polite");
    expect(v3AccessibleAnnouncement("results_published").priority).toBe("polite");
  });

  it("allows specific detail copy without changing announcement priority", () => {
    expect(v3AccessibleAnnouncement("voting_opened", "Semi-final 1 voting is open")).toEqual({
      event: "voting_opened",
      priority: "polite",
      message: "Semi-final 1 voting is open",
      atomic: true,
    });
  });

  it("expands visually small controls to at least the minimum touch target", () => {
    expect(v3AccessibleTouchTarget(18)).toBe(44);
    expect(v3AccessibleTouchTarget(48)).toBe(48);
  });

  it("rejects invalid visible control sizes", () => {
    expect(() => v3AccessibleTouchTarget(0)).toThrow("positive visible control size");
  });
});
