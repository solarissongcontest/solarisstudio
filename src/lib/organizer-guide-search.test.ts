import { describe, expect, it } from "vitest";

import {
  countOrganizerGuideAnswers,
  filterOrganizerGuideSections,
} from "./organizer-guide-search";

const sections = [
  {
    title: "Delegations",
    description: "Confirmations and access",
    questions: [
      { question: "Where do I review confirmation responses?", answer: "review" },
      { question: "How do I recover delegation access?", answer: "access" },
    ],
  },
  {
    title: "Voting",
    description: "Jury and Televote operations",
    questions: [
      { question: "Where do I manage jury voting?", answer: "jury" },
      { question: "Where do I manage public voting?", answer: "televote" },
    ],
  },
] as const;

describe("Organizer Guide search", () => {
  it("returns all sections for a blank query", () => {
    expect(filterOrganizerGuideSections(sections, "   ")).toEqual(sections);
  });

  it("matches section titles case-insensitively and keeps the whole matching section", () => {
    expect(filterOrganizerGuideSections(sections, "DELEGATIONS")).toEqual([sections[0]]);
  });

  it("matches section descriptions and keeps the whole matching section", () => {
    expect(filterOrganizerGuideSections(sections, "televote operations")).toEqual([sections[1]]);
  });

  it("matches individual questions without retaining unrelated questions", () => {
    expect(filterOrganizerGuideSections(sections, "recover delegation")).toEqual([
      {
        ...sections[0],
        questions: [sections[0].questions[1]],
      },
    ]);
  });

  it("returns no sections when nothing matches", () => {
    expect(filterOrganizerGuideSections(sections, "broadcast graphics")).toEqual([]);
  });

  it("counts the visible answers across sections", () => {
    expect(countOrganizerGuideAnswers(sections)).toEqual(4);
    expect(countOrganizerGuideAnswers(filterOrganizerGuideSections(sections, "jury voting"))).toEqual(1);
  });
});
