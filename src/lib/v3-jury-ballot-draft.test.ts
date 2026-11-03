import { describe, expect, it } from "vitest";
import {
  mustReviewLoadedJuryDraft,
  normalizeJuryDraftSelections,
} from "./v3-jury-ballot-draft";

describe("V3 jury ballot draft recovery", () => {
  const eligible = new Set(["oland", "aotea", "fennek"]);

  it("does not treat duplicate or no-longer-eligible entries as completed scores", () => {
    expect(normalizeJuryDraftSelections(
      ["oland", "oland", "disqualified", "aotea"],
      eligible,
      4,
    )).toEqual(["oland", null, null, "aotea"]);
  });

  it("does not restore a prohibited self-vote or malformed saved values", () => {
    const noSelfVote = new Set(["aotea", "fennek"]);
    expect(normalizeJuryDraftSelections(
      ["oland", 42, "aotea", "fennek"],
      noSelfVote,
      4,
    )).toEqual([null, null, "aotea", "fennek"]);
  });

  it("ignores excess saved rows and supplies empty rows for missing scores", () => {
    expect(normalizeJuryDraftSelections(["oland", "aotea", "fennek"], eligible, 2))
      .toEqual(["oland", "aotea"]);
    expect(normalizeJuryDraftSelections(["oland"], eligible, 3))
      .toEqual(["oland", null, null]);
  });

  it("can hydrate a fresh unedited ballot from the server", () => {
    expect(mustReviewLoadedJuryDraft(
      [null, null],
      ["oland", "aotea"],
      false,
    )).toBe(false);
  });

  it("never silently replaces a locally restored or edited ballot", () => {
    expect(mustReviewLoadedJuryDraft(
      ["oland", "aotea"],
      ["aotea", "oland"],
      true,
    )).toBe(true);
    expect(mustReviewLoadedJuryDraft(
      [null, null],
      ["oland", "aotea"],
      true,
    )).toBe(true);
  });

  it("avoids a false conflict when the saved rankings agree", () => {
    expect(mustReviewLoadedJuryDraft(
      ["oland", null],
      ["oland", null],
      true,
    )).toBe(false);
  });
});
