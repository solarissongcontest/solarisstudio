import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/components/v3/V3StoriesIndexScreen.tsx","utf8");
const web = readFileSync("src/routes/stories/index.tsx","utf8");
const css = readFileSync("src/styles/v3-stories-editorial.css","utf8");
describe("Explore Stories editorial lists", () => {
  it("preserves canonical current, archived and unclassified published Story groups",()=>{
    expect(app).toContain("bundle.currentStory");
    expect(app).toContain('featured />');
    expect(app).toContain('title="Story archive"');
    expect(app).toContain("bundle.historicalStories.map((story)");
    expect(app).toContain("bundle.stories.map((story)");
    expect(app).toContain("!hasClassifiedStories");
  });
  it("does not render sensitive story titles before local spoiler reveal",()=>{
    expect(app).toContain("protectedView ? (");
    expect(app).toContain("data-v3-stories-spoiler-protected");
    expect(app).toContain("onClick={() => setRevealed(true)}");
    expect(app).not.toContain(".from(");
    expect(app).not.toContain("useQuery(");
  });
  it("replaces raised story cards with consistent editorial detail links in both browser and app",()=>{
    expect(app).toContain("function StoryCard");
    expect(app).toContain("v3-story-editorial-teaser");
    expect(app).toContain("v3-stories-moments");
    expect(web).toContain("v3-story-web-list");
    expect(web).toContain("v3-story-calendar-list");
    expect(css).toContain("border-bottom:1px solid var(--border)");
    expect(css).toContain("min-height:clamp(17rem");
  });
});
