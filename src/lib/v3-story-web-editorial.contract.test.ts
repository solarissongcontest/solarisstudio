import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const route=readFileSync("src/routes/stories/$editionSlug.tsx","utf8");
const css=readFileSync("src/styles/v3-stories-editorial.css","utf8");
describe("Story web detail editorial parity",()=>{
  it("still delegates installed route to existing published V3 gate and web to safe Story RPC",()=>{
    expect(route).toContain("V3StoryDetailGate");
    expect(route).toContain("loadPublicStoryline(editionSlug)");
    expect(route).toContain("if (isAppMode)");
    expect(route).toContain("fallback={<LegacyEditionStoryPage editionSlug={editionSlug} />}");
  });
  it("uses a distinct text-led masthead, not invented imagery, on web",()=>{
    expect(route).toContain('className="v3-story-web-detail-hero mt-8"');
    expect(route).toContain('className="v3-story-web-timeline-entry"');
    expect(route).not.toContain("story.artwork_url");
    expect(css).toContain(".v3-story-web-detail-hero h1");
    expect(css).toContain(".v3-story-web-timeline-entry");
  });
  it("keeps the original canonical published Story event time, event order and generic metadata",()=>{
    expect(route).toContain("formatSolarisStoryDate(story.publishedAt)");
    expect(route).toContain("story.items.map((item, index)");
    expect(route).toContain("formatSolarisStoryDate(item.occurredAt)");
    expect(route).toContain("Edition Story — Solaris Studio");
  });
});
