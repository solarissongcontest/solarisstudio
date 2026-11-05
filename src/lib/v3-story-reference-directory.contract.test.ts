import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("V3 editorial directory family: Stories and Reference", () => {
  it("preserves the installed Stories rollout and spoiler-free gate", () => {
    const stories = read("src/routes/stories/index.tsx");
    expect(stories).toContain('return <V3StoriesIndexGate fallback={<LegacyStoriesArchivePage presentation="installed-app" />} />');
    expect(stories).toContain("useV3DirectoryPresentation()");
    expect(stories).toContain("platformResolved");
    expect(stories).toContain('data-directory-experience={presentation}');
    expect(stories).toContain('data-directory-mobile-header=""');
    expect(stories).toContain("v3-directory-mobile-list");
    expect(stories).toContain("filteredStories.map");
    expect(stories).toContain("storiesQuery.isError ?");
    expect(stories).toContain("onRetry={() => void storiesQuery.refetch()}");
    expect(stories).toContain("loadPublicStorylines(30)");
    expect(stories).toContain("No edition stories published yet");
    const gate = read("src/components/v3/V3StoriesGates.tsx");
    expect(gate).toContain("resolveV3ResultsSpoilerProtection");
    expect(gate).toContain("hideSpoilers={hideSpoilers}");
  });

  it("keeps one Reference search and one publication authority across all three layouts", () => {
    const source = read("src/routes/encyclopedia/index.tsx");
    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('result_limit: 50');
    expect(source).toContain('normalizedQuery.length >= 2');
    expect(source).toContain("parseSearchRows");
    expect(source).toContain("parseCoverage");
    expect(source).toContain("No private archive data");
    expect(source).toContain("useV3DirectoryPresentation()");
    expect(source).toContain('data-directory-experience={presentation}');
    expect(source).toContain('data-directory-mobile-header=""');
    expect(source).toContain("v3-directory-desktop-rail");
    expect(source).toContain("v3-directory-mobile-list");
    expect(source).toContain("SheetContent");
    expect(source).toContain("SolarisSearchField");
    expect(source).not.toContain("useAllResults");
    expect(source).not.toContain("useAllParticipants");
  });
});
