import { describe, expect, it } from "vitest";

import { filterGuideSections } from "./v3-public-guide-search";

const sections = [
  {
    title: "Taking part",
    description: "Participation responsibilities",
    questions: [
      { question: "Where do I confirm participation?", searchText: "Participate confirmation country" },
      { question: "How do I vote?", searchText: "jury televote voting" },
    ],
  },
  {
    title: "Your account",
    questions: [{ question: "How do I sign in?", searchText: "Me account authentication" }],
  },
] as const;

describe("Public V3 P37 Guide search", () => {
  it("returns all sections for an empty query", () => {
    expect(filterGuideSections(sections, "   ")).toEqual(sections);
  });

  it("matches section titles and descriptions", () => {
    expect(filterGuideSections(sections, "responsibilities").map((section) => section.title)).toEqual([
      "Taking part",
    ]);
  });

  it("matches explicit help keywords without leaking them into the rendered question", () => {
    const result = filterGuideSections(sections, "televote");

    expect(result).toHaveLength(1);
    expect(result[0]?.questions).toHaveLength(1);
    expect(result[0]?.questions[0]?.question).toBe("How do I vote?");
  });

  it("is case-insensitive and returns no synthetic fallback result", () => {
    expect(filterGuideSections(sections, "ACCOUNT")[0]?.title).toBe("Your account");
    expect(filterGuideSections(sections, "definitely-not-a-topic")).toEqual([]);
  });
});
