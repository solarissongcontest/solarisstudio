import { describe, expect, it } from "vitest";

import {
  assertV3ActionContext,
  compareV3ContestContext,
  normalizeV3ContestContext,
  projectV3ContextSwitch,
  v3ContestContextKey,
} from "./v3-context-scope";

const base = {
  competitionId: "solaris-song-contest",
  editionId: "22",
  showId: "semi-1",
} as const;

describe("V3 contest context scoping", () => {
  it("builds explicit competition + edition + show cache keys", () => {
    expect(v3ContestContextKey(base)).toBe("solaris-song-contest:22:semi-1");
  });

  it("normalizes edition-level context without inventing a show", () => {
    expect(
      normalizeV3ContestContext({
        competitionId: " solaris-song-contest ",
        editionId: " 22 ",
      }),
    ).toEqual({ competitionId: "solaris-song-contest", editionId: "22", showId: null });
  });

  it("distinguishes show, edition, competition and completely different contexts", () => {
    expect(compareV3ContestContext(base, base)).toBe("exact");
    expect(compareV3ContestContext(base, { ...base, showId: "final" })).toBe("same_edition");
    expect(compareV3ContestContext(base, { ...base, editionId: "23", showId: null })).toBe(
      "same_competition",
    );
    expect(
      compareV3ContestContext(base, {
        competitionId: "fantasy",
        editionId: "22",
        showId: "semi-1",
      }),
    ).toBe("different");
  });

  it("keeps edition cache on a show switch but clears show/action state", () => {
    expect(projectV3ContextSwitch(base, { ...base, showId: "final" })).toEqual({
      match: "same_edition",
      preserveCompetitionCache: true,
      preserveEditionCache: true,
      preserveShowCache: false,
      clearPrivateActionState: true,
      reloadCanonicalContext: true,
    });
  });

  it("clears edition state when switching editions inside the same competition", () => {
    expect(projectV3ContextSwitch(base, { ...base, editionId: "23", showId: null })).toMatchObject({
      match: "same_competition",
      preserveCompetitionCache: true,
      preserveEditionCache: false,
      preserveShowCache: false,
      clearPrivateActionState: true,
    });
  });

  it("does not allow an action from another show or edition to execute silently", () => {
    expect(() => assertV3ActionContext(base, { ...base, showId: "final" })).toThrow(
      "context mismatch",
    );
    expect(() => assertV3ActionContext(base, { ...base, editionId: "23" })).toThrow(
      "context mismatch",
    );
  });

  it("accepts only exact action context", () => {
    expect(() => assertV3ActionContext(base, base)).not.toThrow();
  });

  it("fails closed when required context identity is missing", () => {
    expect(() =>
      normalizeV3ContestContext({ competitionId: "", editionId: "22" }),
    ).toThrow("competitionId");
  });
});
