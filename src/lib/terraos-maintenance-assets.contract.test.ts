import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const motion = readFileSync("public/assets/terraos-maintenance.js", "utf8");
const storyCss = readFileSync("public/assets/terraos-maintenance-story.css", "utf8");
const storyRuntime = readFileSync("public/assets/terraos-maintenance-story.js", "utf8");
const storyData = readFileSync("src/lib/terraos-maintenance-stories.ts", "utf8");
const server = readFileSync("src/server.ts", "utf8");
const momentA = readFileSync("public/assets/terraos-maintenance/moment-a.png");
const momentB = readFileSync("public/assets/terraos-maintenance/moment-b.png");
const legacyMomentA = readFileSync("public/IMG_6171.png");
const legacyMomentB = readFileSync("public/IMG_9177.png");

describe("TerraOS maintenance visual asset routing", () => {
  it("keeps the final image-led experience entirely inside the already-approved /assets prefix", () => {
    for (const asset of [
      "/assets/terraos-maintenance/atmosphere.jpeg",
      "/assets/terraos-maintenance/moment-a.svg",
      "/assets/terraos-maintenance/moment-b.svg",
      "/assets/terraos-maintenance.css",
      "/assets/terraos-maintenance.js",
      "/assets/terraos-maintenance-story.css",
      "/assets/terraos-maintenance-story.js",
    ]) expect(page).toContain(asset);

    expect(server).toContain('const MAINTENANCE_APP_ASSET_PREFIXES = ["/_build/", "/assets/", "/build/", "/fonts/"] as const;');
    expect(server).not.toContain('"/assets/terraos-maintenance/",');
  });

  it("requires multiple obvious image moments and locally hosted photo layers", () => {
    expect(page.match(/data-photo-kind="photo"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // Each photographic chapter must participate in the motion contract;
    // do not pin the superseded composition's arbitrary total image count.
    const photoTags = page.match(/<img[^>]*data-photo-kind="photo"[^>]*>/g) ?? [];
    expect(photoTags.length).toBeGreaterThanOrEqual(3);
    for (const photo of photoTags) expect(photo).toContain("data-photo-parallax=");
    expect(page.match(/class="photo-chapter/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(css).toContain(".photo-chapter{");
    expect(css).toContain(".live-art{");
  });

  it("uses real dedicated moment artwork instead of recycling the blank and TSBC legacy files", () => {
    const pngSignature = "89504e470d0a1a0a";
    expect(momentA.subarray(0, 8).toString("hex")).toBe(pngSignature);
    expect(momentB.subarray(0, 8).toString("hex")).toBe(pngSignature);
    expect(momentA.length).toBeGreaterThan(5_000);
    expect(momentB.length).toBeGreaterThan(5_000);
    expect(momentA.equals(legacyMomentA)).toBe(false);
    expect(momentB.equals(legacyMomentB)).toBe(false);
  });

  it("keeps Story copy centralized and provides every canonical fixture state", () => {
    for (const id of ["home", "explore", "participate", "results", "me"]) {
      expect(storyData).toContain(`id: "${id}"`);
    }
    for (const fixture of [
      "home_caught_up",
      "home_attention",
      "explore_search",
      "explore_archive",
      "participate_changes_required",
      "participate_complete",
      "participate_voting",
      "results_combined",
      "results_jury",
      "results_televote",
      "me_current",
      "me_history",
    ]) expect(storyData).toContain(fixture);

    expect(page).toContain("serializeTerraOsMaintenanceStories");
    expect(page).toContain('id="terraos-story-data"');
    expect(storyData).toContain('.replaceAll("<", "\\\\u003c")');
  });

  it("makes the five existing carousel cards the Story entry points rather than adding a second runway", () => {
    expect(page).toContain('data-story-card="${story.id}"');
    expect(page).toContain('data-story-view="${story.id}"');
    expect(page).toContain('role="button" tabindex="0" aria-haspopup="dialog"');
    expect(page).toContain("data-story-carousel-progress");
    expect(storyRuntime).not.toContain("story-showcase");
    expect(storyCss).toContain("flex: 0 0 84vw !important");
    expect(storyCss).toContain("scroll-snap-type: x mandatory");
  });

  it("implements hash routing, natural Back behavior and exact Story origin restoration", () => {
    expect(storyRuntime).toContain("#story-${id}");
    expect(storyRuntime).toContain("window.history.pushState");
    expect(storyRuntime).toContain("window.history.go(-depth)");
    expect(storyRuntime).toContain("window.addEventListener('popstate', syncFromLocation)");
    expect(storyRuntime).toContain("scrollY: window.scrollY");
    expect(storyRuntime).toContain("carouselLeft: track ? track.scrollLeft : 0");
    expect(storyRuntime).toContain("card.focus({ preventScroll: true })");
    expect(storyRuntime).toContain("isStoryHash(window.location.hash)");
  });

  it("requires a truthful before/after and interactive fixture demo in every Story View", () => {
    expect(storyRuntime).toContain("data-story-comparison");
    expect(storyRuntime).toContain("data-comparison-tab=\"before\"");
    expect(storyRuntime).toContain("data-comparison-tab=\"after\"");
    for (const demo of ["home", "explore", "participate", "results", "me"]) {
      expect(storyRuntime).toContain(`data-story-demo="${demo}"`);
    }
    expect(storyRuntime).toContain("data-home-toggle");
    expect(storyRuntime).toContain("data-explore-query");
    expect(storyRuntime).toContain("data-participate-next");
    expect(storyRuntime).toContain("data-result-tab");
    expect(storyRuntime).toContain("data-me-history-toggle");
    expect(storyCss).toContain(".story-comparison-before");
    expect(storyCss).toContain("filter: saturate(.65)");
  });

  it("keeps Story previews lazy, fixture-only and independent of protected Confirmation behavior", () => {
    expect(storyRuntime).toContain("/terraos-teaser-preview?screen=${story.id}&chrome=content");
    expect(storyRuntime).not.toContain("maintenance-confirmation");
    expect(storyRuntime).not.toContain("/_serverFn");
    expect(storyRuntime).not.toContain("supabase.co");
    expect(storyRuntime).not.toContain("fetch(");
    expect(storyRuntime).not.toContain("XMLHttpRequest");
  });

  it("preserves accessibility and reduced-motion/transparency fallbacks", () => {
    expect(storyRuntime).toContain("aria-modal");
    expect(storyRuntime).toContain("event.key === 'Escape'");
    expect(storyRuntime).toContain("event.key === 'Tab'");
    expect(storyRuntime).toContain("prefers-reduced-motion: reduce");
    expect(storyCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(storyCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(storyCss).toContain("min-height: 2.75rem");
  });

  it("does not hotlink photography or load visual data through runtime requests", () => {
    for (const host of ["images.unsplash.com", "images.pexels.com", "upload.wikimedia.org"]) {
      expect(page).not.toContain(host);
      expect(css).not.toContain(host);
      expect(motion).not.toContain(host);
      expect(storyCss).not.toContain(host);
      expect(storyRuntime).not.toContain(host);
    }
    expect(motion).not.toContain("fetch(");
    expect(motion).not.toContain("XMLHttpRequest");
    expect(storyRuntime).not.toContain("fetch(");
    expect(storyRuntime).not.toContain("XMLHttpRequest");
  });
});
