import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const index = readFileSync("src/routes/stories/index.tsx", "utf8");
const detail = readFileSync("src/routes/stories/$editionSlug.tsx", "utf8");
const gates = readFileSync("src/components/v3/V3StoriesGates.tsx", "utf8");

describe("V3 Stories: reconciled editorial and public spoiler contracts", () => {
  it("preserves the featured first story and editorial publication rhythm of #2602", () => {
    expect(index).toContain("v3-editorial-stories");
    expect(index).toContain("v3-stories-feature group");
    expect(index).toContain("v3-stories-feature-moment");
    expect(index).toContain("v3-stories-teaser-moment");
    expect(index).toContain("v3-stories-date-item");
    expect(detail).toContain("v3-editorial-story-detail");
    expect(detail).toContain("v3-story-article-timeline");
    expect(detail).toContain("v3-story-article-event");
  });

  it("never renders old cached stories or moments while public visibility is being rechecked", () => {
    expect(index).toContain("storiesQuery.isSuccess && !storiesQuery.isFetching && !storiesQuery.isRefetchError");
    expect(index).toContain("anniversaryQuery.isSuccess && !anniversaryQuery.isFetching");
    expect(index).toContain("storiesQuery.isError || storiesQuery.isRefetchError ?");
    expect(index).toContain("storiesQuery.isLoading || storiesQuery.isFetching ?");
    expect(detail).toContain("storyQuery.isSuccess && !storyQuery.isFetching && !storyQuery.isRefetchError");
    expect(detail).toContain("storyQuery.isLoading || storyQuery.isFetching ?");
    expect(detail).toContain("storyQuery.isError || storyQuery.isRefetchError ?");
    expect(index).not.toContain("placeholderData: (previous) => previous");
    expect(detail).not.toContain("service_role");
  });

  it("protects search, featured cards, calendar and article share with one spoiler decision", () => {
    expect(index).toContain("installedFallbackProtection ?? preferences.spoilerFree");
    expect(detail).toContain("installedFallbackProtection ?? preferences.spoilerFree");
    expect(gates).toContain("StoryFallbackSpoilerContext.Provider value={protectedContent}");
    expect(gates).toContain("resolveV3ResultsSpoilerProtection({");
    const protectedStart = index.indexOf("<PublicStorySpoilerDisclosure");
    const publishedCards = index.indexOf("filteredStories.map");
    const calendar = index.indexOf('aria-labelledby="today-heading"');
    const protectedEnd = index.indexOf("</PublicStorySpoilerDisclosure>");
    expect(protectedStart).toBeGreaterThan(-1);
    expect(publishedCards).toBeGreaterThan(protectedStart);
    expect(calendar).toBeGreaterThan(publishedCards);
    expect(protectedEnd).toBeGreaterThan(calendar);
    const detailStart = detail.indexOf("<PublicStorySpoilerDisclosure");
    const share = detail.indexOf("<PublicShareStoryButton");
    const detailEnd = detail.indexOf("</PublicStorySpoilerDisclosure>");
    expect(share).toBeGreaterThan(detailStart);
    expect(share).toBeLessThan(detailEnd);
  });

  it("expands published history only after a visitor action, bounded at the existing RPC maximum", () => {
    expect(index).toContain("queryKey: ['public-storylines', storyLimit]");
    expect(index).toContain("loadPublicStorylines(storyLimit)");
    expect(index).toContain("nextPublicStoryBatchLimit(limit)");
    expect(index).toContain("setStoryLimit(PUBLIC_STORY_RPC_MAX)");
    expect(index).toContain("Search more published history");
    expect(index).toContain("Read this edition story");
    expect(index).toContain("Earlier history may exist beyond this archive search limit.");
    expect(index).not.toContain("useAllResults");
    expect(index).not.toContain("useAllJuryVotes");
    expect(detail).toContain("allowsReleased(");
    expect(detail).toContain('to="/editions/$slug"');
  });
});
