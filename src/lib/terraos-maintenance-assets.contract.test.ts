import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const motion = readFileSync("public/assets/terraos-maintenance.js", "utf8");
const storyCss = readFileSync("public/assets/terraos-maintenance-story.css", "utf8");
const storyRuntime = readFileSync("public/assets/terraos-maintenance-story.js", "utf8");
const server = readFileSync("src/server.ts", "utf8");

describe("TerraOS maintenance visual asset routing", () => {
  it("keeps the final image-led experience entirely inside the already-approved /assets prefix", () => {
    for (const asset of [
      "/assets/terraos-maintenance/atmosphere.jpeg",
      "/assets/terraos-maintenance/moment-a.png",
      "/assets/terraos-maintenance/moment-b.png",
      "/assets/terraos-maintenance.css",
      "/assets/terraos-maintenance.js",
    ]) expect(page).toContain(asset);

    expect(motion).toContain("/assets/terraos-maintenance-story.css");
    expect(motion).toContain("/assets/terraos-maintenance-story.js");
    expect(server).toContain('const MAINTENANCE_APP_ASSET_PREFIXES = ["/_build/", "/assets/", "/build/", "/fonts/"] as const;');
    expect(server).not.toContain('"/assets/terraos-maintenance/",');
  });

  it("requires multiple obvious image moments and locally hosted photo layers", () => {
    expect(page.match(/data-photo-kind=\"photo\"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(page.match(/data-photo-parallax=/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
    expect(page.match(/class=\"photo-chapter/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(css).toContain(".photo-chapter{");
    expect(css).toContain(".live-art{");
    expect(storyCss).toContain('/assets/terraos-maintenance/atmosphere.jpeg');
    expect(storyCss).toContain('/assets/terraos-maintenance/moment-a.png');
    expect(storyCss).toContain('/assets/terraos-maintenance/moment-b.png');
  });

  it("keeps the five Story Views local, lazy and independent of protected Confirmation behavior", () => {
    for (const key of ["home", "explore", "participate", "results", "me"]) {
      expect(storyRuntime).toContain(`key: '${key}'`);
    }
    expect(storyRuntime).toContain("data-story-view");
    expect(storyRuntime).toContain("aria-modal");
    expect(storyRuntime).toContain("/terraos-teaser-preview?screen=${story.key}&chrome=content");
    expect(storyRuntime).not.toContain("maintenance-confirmation");
    expect(storyRuntime).not.toContain("/_serverFn");
  });

  it("does not hotlink photography or load visual data through runtime fetches", () => {
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
