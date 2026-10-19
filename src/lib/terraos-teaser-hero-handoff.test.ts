import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveTerraOsHeroHandoffProgress } from "./terraos-teaser-hero-handoff";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-hero-handoff.ts"), "utf8");
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS hero-to-first-look handoff", () => {
  it("maps the story approach to one reversible bounded handoff progress", () => {
    expect(resolveTerraOsHeroHandoffProgress(920, 1000)).toBe(0);
    expect(resolveTerraOsHeroHandoffProgress(530, 1000)).toBeCloseTo(0.5);
    expect(resolveTerraOsHeroHandoffProgress(140, 1000)).toBe(1);
    expect(resolveTerraOsHeroHandoffProgress(1100, 1000)).toBe(0);
    expect(resolveTerraOsHeroHandoffProgress(-200, 1000)).toBe(1);
  });

  it("moves the real destination device instead of cloning or screenshotting the product", () => {
    const implementation = source();
    expect(implementation).toContain('.first-look');
    expect(implementation).toContain('.preview-device');
    expect(implementation).toContain('.hero .phone.center');
    expect(implementation).toContain('data-terraos-handoff-placeholder');
    expect(implementation).not.toContain('cloneNode');
    expect(implementation).not.toContain('createElement("iframe")');
    expect(implementation).not.toContain('canvas');
  });

  it("prewarms only the existing lazy Home iframe shortly before the handoff", () => {
    const implementation = source();
    expect(implementation).toContain('destinationPhone.querySelector<HTMLIFrameElement>("iframe.preview-page")');
    expect(implementation).toContain('hostWindow.innerHeight * 1.18');
    expect(implementation).toContain('destinationFrame?.loading === "lazy"');
    expect(implementation).toContain('destinationFrame.loading = "eager"');
    expect(implementation).not.toContain('createElement("iframe")');
  });

  it("preserves browser scroll ownership and keeps the handoff reversible", () => {
    const implementation = source();
    expect(implementation).toContain('addEventListener("scroll", requestRender, { passive: true })');
    expect(implementation).toContain('restoreNaturalDevice(false)');
    expect(implementation).toContain('restoreNaturalDevice(true)');
    expect(implementation).not.toContain('preventDefault');
    expect(implementation).not.toContain('scrollTo(');
    expect(implementation).not.toContain('scrollBy(');
    expect(implementation).not.toContain('addEventListener("wheel"');
  });

  it("removes spatial handoff behavior under Reduce Motion", () => {
    const implementation = source();
    expect(implementation).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(implementation).toContain('terraosHeroHandoff = "reduced"');
    expect(implementation).toContain('restoreNaturalDevice(false)');
  });

  it("installs only from the existing full Home fixture bridge", () => {
    const route = routeSource();
    expect(route).toContain('installTerraOsTeaserHeroHandoff');
    expect(route).toContain('screen !== "home" || chrome === "content"');
    expect(source()).not.toContain('supabase');
    expect(source()).not.toContain('fetch(');
  });
});
