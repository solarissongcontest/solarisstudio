import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clampTerraOsProgress,
  resolveTerraOsRevealProgress,
  resolveTerraOsSectionProgress,
} from "./terraos-teaser-host-choreography";

const previewSource = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/TerraOSTeaserPreview.tsx"), "utf8");
const choreographySource = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-host-choreography.ts"), "utf8");

describe("TerraOS release-page choreography", () => {
  it("keeps progress bounded and reversible", () => {
    expect(clampTerraOsProgress(-2)).toBe(0);
    expect(clampTerraOsProgress(0.42)).toBe(0.42);
    expect(clampTerraOsProgress(2)).toBe(1);

    expect(resolveTerraOsSectionProgress(100, 2400, 800)).toBe(0);
    expect(resolveTerraOsSectionProgress(-800, 2400, 800)).toBe(0.5);
    expect(resolveTerraOsSectionProgress(-1600, 2400, 800)).toBe(1);
    expect(resolveTerraOsSectionProgress(-800, 2400, 800)).toBe(0.5);
  });

  it("uses explicit reveal windows instead of one-way observers", () => {
    expect(resolveTerraOsRevealProgress(0.1, 0.2, 0.4)).toBe(0);
    expect(resolveTerraOsRevealProgress(0.3, 0.2, 0.4)).toBeCloseTo(0.5);
    expect(resolveTerraOsRevealProgress(0.6, 0.2, 0.4)).toBe(1);
  });

  it("installs from the fixture-only Home preview and preserves the teaser boundary", () => {
    const preview = previewSource();
    const choreography = choreographySource();

    expect(preview).toContain("installTerraOsTeaserHostChoreography");
    expect(preview).toContain('screen !== "home"');
    expect(choreography).toContain('[data-solaris-maintenance="true"]');
    expect(choreography).toContain("No product data is fetched");
    expect(choreography).not.toContain("supabase");
    expect(choreography).not.toContain("fetch(");
  });

  it("keeps Reduce Motion as a structural alternative rather than slowed spatial motion", () => {
    const choreography = choreographySource();
    expect(choreography).toContain("prefers-reduced-motion: reduce");
    expect(choreography).toContain('data-terraos-reduced-motion="true"');
    expect(choreography).toContain("min-height: auto");
    expect(choreography).toContain("position: static");
  });

  it("pins the major product scenes and drives the real preview navigation from one scroll progress", () => {
    const choreography = choreographySource();
    expect(choreography).toContain(".story-touch[data-terra-scroll-scene");
    expect(choreography).toContain(".participation-story[data-terra-scroll-scene");
    expect(choreography).toContain(".results-story[data-terra-scroll-scene");
    expect(choreography).toContain('demo.style.setProperty("--p", navProgress.toFixed(4))');
    expect(choreography).toContain("updateNavigationStory");
    expect(choreography).toContain("updateParticipationStory");
    expect(choreography).toContain("updateResultsStory");
  });
});
