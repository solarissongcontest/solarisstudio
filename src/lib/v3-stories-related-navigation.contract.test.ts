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

  it("links a published Story to its canonical Edition and other published Stories", () => {
    const screen = source("src/components/v3/V3StoryDetailScreen.tsx");

    expect(screen).toContain('aria-label="Story context"');
    expect(screen).toContain('to="/editions/$slug"');
    expect(screen).toContain("params={{ slug: editionSlug }}");
    expect(screen).toContain('to="/stories/$editionSlug"');
    expect(screen).toContain("params={{ editionSlug: related.editionSlug }}");
    expect(screen).toContain("bundle.moreStories.map");
  });

  it("keeps safe Edition context visible but Story payload, sharing and neighbour titles behind spoiler reveal", () => {
    const screen = source("src/components/v3/V3StoryDetailScreen.tsx");
    const spoilerGuard = screen.indexOf("if (hideSpoilers && !revealed)");
    const shareAction = screen.indexOf("<StoryShareButton");
    const relatedStories = screen.indexOf("bundle.moreStories.length");
    const protectedBranch = screen.slice(spoilerGuard, shareAction);

    expect(spoilerGuard).toBeGreaterThanOrEqual(0);
    expect(shareAction).toBeGreaterThan(spoilerGuard);
    expect(relatedStories).toBeGreaterThan(shareAction);
    expect(protectedBranch).toContain("<StoryContextLinks editionSlug={story.editionSlug} />");
    expect(protectedBranch).toContain("Reveal edition story");
    expect(protectedBranch).not.toContain("StoryShareButton title=");
    expect(protectedBranch).not.toContain("related.title");
    expect(protectedBranch).not.toContain("bundle.moreStories.map");
  });

  it("shares only the canonical Story route derived from the published Edition slug", () => {
    const screen = source("src/components/v3/V3StoryDetailScreen.tsx");

    expect(screen).toContain("new URL(`/stories/${encodeURIComponent(editionSlug)}`, window.location.origin)");
    expect(screen).toContain("await navigator.share({ title, url })");
    expect(screen).toContain("await navigator.clipboard.writeText(url)");
    expect(screen).not.toContain("encodeURIComponent(title)");
  });
});
