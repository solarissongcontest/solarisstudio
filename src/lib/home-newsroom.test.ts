import { describe, expect, it } from "vitest";

import {
  buildHomeNewsroomStories,
  runnerUpStory,
  votingStories,
  type HomeNewsStory,
} from "./home-newsroom";

type Entry = Parameters<typeof runnerUpStory>[0][number];

function entry(overrides: Partial<Entry> & Pick<Entry, "countryId" | "name" | "finalRank">): Entry {
  return {
    id: overrides.countryId,
    juryPoints: 0,
    televotePoints: 0,
    totalPoints: 0,
    ...overrides,
  };
}

describe("homepage newsroom copy", () => {
  it("uses breaking copy for a photo-finish runner-up", () => {
    const story = runnerUpStory([
      entry({ countryId: "a", name: "Asteria", finalRank: 1, totalPoints: 301 }),
      entry({ countryId: "b", name: "Borealia", finalRank: 2, totalPoints: 299 }),
    ]);

    expect(story?.intensity).toBe("breaking");
    expect(story?.headline).toContain("ALMOST STEAL THE WIN");
    expect(story?.detail).toContain("2 points");
  });

  it("uses calmer copy when second place is far behind", () => {
    const story = runnerUpStory([
      entry({ countryId: "a", name: "Asteria", finalRank: 1, totalPoints: 400 }),
      entry({ countryId: "b", name: "Borealia", finalRank: 2, totalPoints: 250 }),
    ]);

    expect(story?.intensity).toBe("standard");
    expect(story?.headline).toContain("finished second");
    expect(story?.headline).not.toContain("ALMOST STEAL");
  });

  it("detects when the jury winner loses overall", () => {
    const stories = votingStories([
      entry({ countryId: "a", name: "Asteria", finalRank: 1, juryPoints: 80, televotePoints: 160, totalPoints: 240 }),
      entry({ countryId: "b", name: "Borealia", finalRank: 2, juryPoints: 170, televotePoints: 40, totalPoints: 210 }),
      entry({ countryId: "c", name: "Cychet", finalRank: 3, juryPoints: 70, televotePoints: 90, totalPoints: 160 }),
    ]);

    expect(stories.some((story: HomeNewsStory) => story.id === "jury-overturned")).toBe(true);
  });

  it("prioritizes breaking stories before ordinary ones", () => {
    const stories = buildHomeNewsroomStories([
      entry({ countryId: "a", name: "Asteria", finalRank: 1, juryPoints: 100, televotePoints: 100, totalPoints: 200 }),
      entry({ countryId: "b", name: "Borealia", finalRank: 2, juryPoints: 150, televotePoints: 48, totalPoints: 198 }),
      entry({ countryId: "c", name: "Cychet", finalRank: 3, juryPoints: 20, televotePoints: 150, totalPoints: 170 }),
    ]);

    expect(stories[0]?.intensity).toBe("breaking");
  });
});
