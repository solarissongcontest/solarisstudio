import { describe, expect, it } from "vitest";
import { resolvePublishedScoreboardAdvancement } from "./v3-scoreboard-advancement";

describe("published V3 scoreboard advancement", () => {
  it("shows explicitly confirmed qualification and non-qualification in a qualifying show", () => {
    expect(resolvePublishedScoreboardAdvancement(10, true)).toBe("qualified");
    expect(resolvePublishedScoreboardAdvancement(10, false)).toBe("eliminated");
  });

  it("does not guess unknown qualifications from a result's ordinal place", () => {
    // The helper intentionally has no rank argument: it cannot create an
    // official qualification decision from a published combined scoreboard.
    expect(resolvePublishedScoreboardAdvancement(10, null)).toBeNull();
    expect(resolvePublishedScoreboardAdvancement(10, undefined)).toBeNull();
  });

  it("does not show advancement badges for finals or unreleased qualification stages", () => {
    expect(resolvePublishedScoreboardAdvancement(null, true)).toBeNull();
    expect(resolvePublishedScoreboardAdvancement(undefined, false)).toBeNull();
    expect(resolvePublishedScoreboardAdvancement(0, true)).toBeNull();
    expect(resolvePublishedScoreboardAdvancement(-1, false)).toBeNull();
    expect(resolvePublishedScoreboardAdvancement(Number.NaN, true)).toBeNull();
  });

  it("preserves explicit organizer decisions even when a numerical cutoff would disagree", () => {
    // Wildcards and exceptional decisions must not be overridden by top-N UI logic.
    expect(resolvePublishedScoreboardAdvancement(1, true)).toBe("qualified");
    expect(resolvePublishedScoreboardAdvancement(100, false)).toBe("eliminated");
  });
});
