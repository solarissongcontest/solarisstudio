import { describe, expect, it } from "vitest";
import { suggestedPublicWorldComparisonPair } from "./world-document-comparison";

describe("TG4 published document reader comparison entry", () => {
  const history = [
    { versionNumber: 2, publicationState: "superseded" },
    { versionNumber: 3, publicationState: "published" },
    { versionNumber: 1, publicationState: "historical_source" },
    { versionNumber: 4, publicationState: "draft" },
  ];

  it("offers the latest distinct public version in chronological order", () => {
    expect(suggestedPublicWorldComparisonPair(2, history))
      .toEqual({ from: 2, to: 3, otherVersion: 3 });
    expect(suggestedPublicWorldComparisonPair(3, history))
      .toEqual({ from: 2, to: 3, otherVersion: 2 });
    expect(suggestedPublicWorldComparisonPair(1, history))
      .toEqual({ from: 1, to: 3, otherVersion: 3 });
  });

  it("never offers an unpublished or self-only pair", () => {
    expect(suggestedPublicWorldComparisonPair(2, [
      { versionNumber: 2, publicationState: "published" },
      { versionNumber: 5, publicationState: "draft" },
      { versionNumber: 1, publicationState: "member_only" },
    ])).toBeNull();
    expect(suggestedPublicWorldComparisonPair(1, [])).toBeNull();
  });

  it("rejects invalid numbers rather than generating broken legal history links", () => {
    expect(suggestedPublicWorldComparisonPair(0, history)).toBeNull();
    expect(suggestedPublicWorldComparisonPair(NaN, history)).toBeNull();
    expect(suggestedPublicWorldComparisonPair(1, [
      { versionNumber: Number.MAX_SAFE_INTEGER + 1, publicationState: "published" },
    ])).toBeNull();
  });
});
