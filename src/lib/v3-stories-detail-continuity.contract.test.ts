import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const storySource = source("src/integrations/v3/stories-source.server.ts");
const storyModel = source("src/lib/v3-stories.ts");
const storyScreen = source("src/components/v3/V3StoryDetailScreen.tsx");
const storyRoute = source("src/routes/stories/$editionSlug.tsx");

describe("V3 Story detail continuity", () => {
  it("builds Edition and related-story continuity only from public Story projections", () => {
    expect(storySource).toContain('client.rpc("studio2_public_storyline"');
    expect(storySource).toContain('client.rpc("studio2_public_storylines"');
    expect(storySource).toContain("candidate.editionId !== story.editionId");
    expect(storySource).toContain(".slice(0, 3)");
    expect(storySource).toContain("`/editions/${encodeURIComponent(story.editionSlug)}`");
    expect(storySource).not.toContain("supabaseAdmin");
    expect(storySource).not.toContain('.from("story');
  });

  it("keeps optional related-content failure from hiding a valid published Story", () => {
    expect(storySource).toContain("try {");
    expect(storySource).toContain("} catch {");
    expect(storySource).toContain("relatedStories = [];");
    expect(storySource).not.toContain(
      'throwIfError(relatedResult.error, "Could not load published Solaris stories")',
    );
  });

  it("keeps share and related-story disclosure behind the spoiler reveal boundary", () => {
    const protectedStart = storyScreen.indexOf("if (hideSpoilers && !revealed)");
    const shareStart = storyScreen.indexOf("const shareTitle = story.title");
    expect(protectedStart).toBeGreaterThanOrEqual(0);
    expect(shareStart).toBeGreaterThan(protectedStart);

    const protectedBlock = storyScreen.slice(protectedStart, shareStart);
    expect(protectedBlock).not.toContain("Share story");
    expect(protectedBlock).not.toContain("relatedStories");
    expect(storyScreen).toContain("navigator.share");
    expect(storyScreen).toContain("navigator.clipboard?.writeText");
    expect(storyScreen).toContain('title="More published stories"');
  });

  it("captures a non-null share title before the async callback", () => {
    expect(storyScreen).toContain("const shareTitle = story.title;");
    expect(storyScreen).toContain("navigator.share({ title: shareTitle, url })");
    expect(storyScreen).not.toContain("navigator.share({ title: story.title, url })");
  });

  it("keeps archival Story dates deterministic across SSR and hydration", () => {
    expect(storyScreen).toContain("formatV3StoryDate");
    expect(storyScreen).not.toContain("toLocaleDateString");
    expect(storyModel).toContain('new Intl.DateTimeFormat("en-GB"');
    expect(storyModel).toContain("timeZone: SOLARIS_TIME_ZONE");
    expect(storyModel).not.toContain("resolvedOptions().timeZone");
  });

  it("keeps shared-link metadata generic instead of leaking Story content", () => {
    const headStart = storyRoute.indexOf("head: ({ params }) => {");
    const componentStart = storyRoute.indexOf("component: EditionStoryPage");
    expect(headStart).toBeGreaterThanOrEqual(0);
    expect(componentStart).toBeGreaterThan(headStart);

    const headBlock = storyRoute.slice(headStart, componentStart);
    expect(headBlock).toContain("Edition Story — Solaris Studio");
    expect(headBlock).toContain("A reviewed edition timeline from the Solaris Song Contest archive.");
    expect(headBlock).not.toContain("story.title");
    expect(headBlock).not.toContain("story.introduction");
  });
});
