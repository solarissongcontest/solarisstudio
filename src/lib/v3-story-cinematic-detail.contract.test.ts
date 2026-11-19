import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const detail=readFileSync("src/components/v3/V3StoryDetailScreen.tsx","utf8");
const style=readFileSync("src/styles/v3-stories-editorial.css","utf8");
describe("Published Story cinematic detail",()=>{
 it("places published Edition artwork behind the Story identity only AFTER spoiler reveal",()=>{
   expect(detail).toContain("if (hideSpoilers && !revealed)");
   const protectedAt=detail.indexOf("if (hideSpoilers && !revealed)");
   const heroAt=detail.indexOf('className="v3-story-detail-hero"');
   expect(heroAt).toBeGreaterThan(protectedAt);
   expect(detail).toContain("bundle.artwork ? (");
   expect(detail).toContain("src={bundle.artwork.src}");
   expect(detail).toContain("alt={bundle.artwork.alt}");
   expect(detail).toContain("onError={() => setFailedArtworkUrl");
   expect(detail).not.toContain('.from("editions")');
 });
 it("keeps official Solaris timestamps and distinct related story links",()=>{
   expect(detail).toContain('formatEventWallTime(story.publishedAt, { locale: "en-GB" })');
   expect(detail).toContain('formatEventWallTime(item.occurredAt, { locale: "en-GB" })');
   expect(detail).toContain("story.items.map((item, index)");
   expect(detail).toContain("bundle.relatedStories.map((related)");
   expect(detail).toContain("navigator.share");
   expect(detail).toContain("v3-story-detail-related__link");
 });
 it("avoids repeating card-within-card timeline surfaces",()=>{
   expect(detail).toContain("v3-story-timeline-entry");
   expect(detail).not.toContain('<V3Surface level="raised" className="p-5">\n                    <div');
   expect(style).toContain(".v3-story-detail-hero__fade");
   expect(style).toContain("linear-gradient(0deg");
 });
});
