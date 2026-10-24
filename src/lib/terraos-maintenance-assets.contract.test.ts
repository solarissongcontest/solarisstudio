import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const css = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const motion = readFileSync("public/assets/terraos-maintenance.js", "utf8");
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

  it("does not hotlink photography or load visual data through runtime fetches", () => {
    for (const host of ["images.unsplash.com", "images.pexels.com", "upload.wikimedia.org"]) {
      expect(page).not.toContain(host);
      expect(css).not.toContain(host);
      expect(motion).not.toContain(host);
    }
    expect(motion).not.toContain("fetch(");
    expect(motion).not.toContain("XMLHttpRequest");
  });
});
