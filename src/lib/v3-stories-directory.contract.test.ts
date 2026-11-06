import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Stories directory classification", () => {
  it("uses canonical published Edition lifecycle rather than browser time or Story ordering", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");

    expect(source).toContain("resolveCurrentPublicEdition");
    expect(source).toContain("normalizeLegacyEditionStatus");
    expect(source).toContain('.from("editions")');
    expect(source).toContain('.select("id,edition_number,status,published")');
    expect(source).toContain('.eq("published", true)');
    expect(source).toContain('.order("edition_number", { ascending: false })');
    expect(source).toContain(".limit(50)");
    expect(source).not.toContain("Date.now()");
  });

  it("does not promote terminal Edition fallback into the current Story surface", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");
    const resolver = source.split("async function loadCurrentStoryEditionContext")[1]?.split("async function loadPublishedEditionArtwork")[0] ?? "";

    expect(resolver).toContain('lifecycle === "post_edition" || lifecycle === "archived"');
    expect(resolver).toContain("return { resolved: true, editionId: null }");
    expect(source).toContain("stories.find((story) => story.editionId === currentEditionContext.editionId)");
  });

  it("fails classification soft without losing published Stories", () => {
    const source = read("src/integrations/v3/stories-source.server.ts");
    const screen = read("src/components/v3/V3StoriesIndexScreen.tsx");

    expect(source).toContain("return { resolved: false, editionId: null }");
    expect(source).toContain("historicalStories = currentEditionContext.resolved");
    expect(screen).toContain("!hasClassifiedStories");
    expect(screen).toContain("bundle.stories.map((story)");
  });

  it("renders current and historical Story collections as distinct directory surfaces", () => {
    const screen = read("src/components/v3/V3StoriesIndexScreen.tsx");

    expect(screen).toContain('title="Current edition story"');
    expect(screen).toContain('title="Story archive"');
    expect(screen).toContain("bundle.currentStory");
    expect(screen).toContain("bundle.historicalStories.map((story)");
    expect(screen).toContain("function StoryCard");
  });

  it("formats Story publication and timeline timestamps through canonical Solaris event time", () => {
    const screen = read("src/components/v3/V3StoryDetailScreen.tsx");

    expect(screen).toContain('import { formatEventWallTime } from "@/lib/public-time"');
    expect(screen).toContain('formatEventWallTime(story.publishedAt, { locale: "en-GB" })');
    expect(screen).toContain('formatEventWallTime(item.occurredAt, { locale: "en-GB" })');
    expect(screen).not.toContain("toLocaleDateString(undefined");
    expect(screen).not.toContain("new Date(value)");
  });
});
