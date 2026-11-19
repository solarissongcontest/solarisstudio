import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveCinematicObjectPosition } from "./cinematic-hero";

const country = readFileSync("src/components/v3/V3DelegationScreen.tsx", "utf8");
const edition = readFileSync("src/components/v3/V3EditionOverviewScreen.tsx", "utf8");
const hero = readFileSync("src/components/v3/CinematicEditorialHero.tsx", "utf8");
const css = readFileSync("src/styles/v3-cinematic-entities.css", "utf8");

describe("Explore cinematic Country and Edition first slice", () => {
  it("clamps saved image focal points and centers malformed values", () => {
    expect(resolveCinematicObjectPosition([0.2, 0.75])).toBe("20% 75%");
    expect(resolveCinematicObjectPosition([-10, 10])).toBe("0% 100%");
    expect(resolveCinematicObjectPosition([Number.NaN, Number.POSITIVE_INFINITY])).toBe("50% 50%");
    expect(resolveCinematicObjectPosition(null)).toBe("50% 50%");
  });
  it("keeps country identity, 3:2 flag and existing publication-safe content", () => {
    expect(country).toContain('<CinematicEditorialHero');
    expect(country).toContain('imageUrl={null}');
    expect(country).toContain('data-cinematic-flag-ratio="3:2"');
    expect(country).toContain("projection.currentResult");
    expect(country).toContain("hideResultSpoilers");
    expect(country).toContain("projection.participationHistory");
    expect(country).toContain("followControl");
  });
  it("uses published Edition artwork without bypassing spoiler protection", () => {
    expect(edition).toContain('<CinematicEditorialHero');
    expect(edition).toContain('imageUrl={spoilerSafe ? null : projection.hub.hero.artworkUrl}');
    expect(edition).toContain("SpoilerRevealCard");
    expect(edition).toContain("canOpenV3EditionResults");
  });
  it("reserves the visual fade and safe responsive reading design without nested hero cards", () => {
    expect(hero).toContain('data-has-image={imageUrl ? "true" : "false"}');
    expect(hero).toContain("loading=\"eager\"");
    expect(css).toContain("var(--cinematic-canvas");
    expect(css).toContain("aspect-ratio: 3 / 2");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("scroll-margin-top");
    expect(country).not.toContain('<V3ScreenHeader');
  });
});
