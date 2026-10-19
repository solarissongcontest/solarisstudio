import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Stories published relationship navigation", () => {
  it("derives bounded neighbouring stories only from the published Story projection", () => {
    const server = source("src/integrations/v3/stories-source.server.ts");

    expect(server).toContain('client.rpc("studio2_public_storyline"');
    expect(server).toContain('client.rpc("studio2_public_storylines", { p_limit: 12 })');
    expect(server).toContain("candidate.editionId !== story.editionId");
    expect(server).toContain(".slice(0, 3)");
    expect(server).toContain("moreStories: []");
    expect(server).not.toMatch(/\.from\(["']studio2_storylines["']\)/);
    expect(server).not.toContain("studio2_storytelling_snapshot");
  });

  it("links a revealed Story back to its canonical Edition and other published Stories", () => {
    const screen = source("src/components/v3/V3StoryDetailScreen.tsx");

    expect(screen).toContain('to="/editions/$slug"');
    expect(screen).toContain("params={{ slug: story.editionSlug }}");
    expect(screen).toContain('to="/stories/$editionSlug"');
    expect(screen).toContain("params={{ editionSlug: related.editionSlug }}");
    expect(screen).toContain("bundle.moreStories.map");
  });

  it("keeps related Story titles behind the existing spoiler reveal boundary", () => {
    const screen = source("src/components/v3/V3StoryDetailScreen.tsx");
    const spoilerGuard = screen.indexOf("if (hideSpoilers && !revealed)");
    const relatedStories = screen.indexOf("bundle.moreStories.length");

    expect(spoilerGuard).toBeGreaterThanOrEqual(0);
    expect(relatedStories).toBeGreaterThan(spoilerGuard);
    expect(screen.slice(spoilerGuard, relatedStories)).toContain("Reveal edition story");
    expect(screen.slice(spoilerGuard, relatedStories)).not.toContain("related.title");
  });
});
