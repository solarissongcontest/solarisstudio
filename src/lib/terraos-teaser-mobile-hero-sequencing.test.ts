import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveTerraOsMobileHeroProgress,
  resolveTerraOsMobileHeroState,
} from "./terraos-teaser-mobile-hero-sequencing";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/terraos-teaser-mobile-hero-sequencing.ts"),
    "utf8",
  );
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS mobile hero sequencing", () => {
  it("protects the launch copy before any phone becomes visible", () => {
    const initial = resolveTerraOsMobileHeroState(0);
    expect(initial.titleOpacity).toBe(1);
    expect(initial.taglineOpacity).toBe(1);
    expect(initial.dateOpacity).toBe(1);
    expect(initial.countdownOpacity).toBe(1);
    expect(initial.centerOpacity).toBe(0);
    expect(initial.sideOpacity).toBe(0);

    const countdownDominant = resolveTerraOsMobileHeroState(0.36);
    expect(countdownDominant.taglineOpacity).toBe(0);
    expect(countdownDominant.dateOpacity).toBeLessThan(0.1);
    expect(countdownDominant.countdownOpacity).toBe(1);
    expect(countdownDominant.centerOpacity).toBe(0);
  });

  it("does not let the centre phone meaningfully enter until the countdown clears", () => {
    const clearing = resolveTerraOsMobileHeroState(0.58);
    const phone = resolveTerraOsMobileHeroState(0.66);

    expect(clearing.countdownOpacity).toBeLessThan(0.1);
    expect(clearing.centerOpacity).toBeLessThan(0.1);
    expect(phone.countdownOpacity).toBe(0);
    expect(phone.centerOpacity).toBeGreaterThan(0.5);
    expect(phone.sideOpacity).toBe(0);
  });

  it("uses side phones only as a brief secondary composition", () => {
    const centreFirst = resolveTerraOsMobileHeroState(0.7);
    const ensemble = resolveTerraOsMobileHeroState(0.78);
    const exit = resolveTerraOsMobileHeroState(1);

    expect(centreFirst.centerOpacity).toBeGreaterThan(0.9);
    expect(centreFirst.sideOpacity).toBeLessThan(0.05);
    expect(ensemble.centerOpacity).toBe(1);
    expect(ensemble.sideOpacity).toBeGreaterThan(0.2);
    expect(exit.centerOpacity).toBe(1);
    expect(exit.sideOpacity).toBe(0);
    expect(exit.sideSpread).toBeGreaterThan(ensemble.sideSpread);
  });

  it("derives reversible bounded progress from the real hero geometry", () => {
    expect(resolveTerraOsMobileHeroProgress(0, 1280, 800)).toBe(0);
    const middle = resolveTerraOsMobileHeroProgress(-460, 1280, 800);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(resolveTerraOsMobileHeroProgress(-2000, 1280, 800)).toBe(1);
    expect(resolveTerraOsMobileHeroProgress(-460, 1280, 800)).toBe(middle);
  });

  it("gives the centre phone a mobile width and strict viewport-height ceiling", () => {
    const implementation = source();
    expect(implementation).toContain("width: min(76vw, 36svh, 300px)");
    expect(implementation).toContain("aspect-ratio: 390 / 844");
    expect(implementation).toContain("min-height: max(1120px, 160svh)");
    expect(implementation).toContain("--terraos-mobile-center-opacity");
    expect(implementation).toContain("--terraos-mobile-side-opacity");
  });

  it("keeps native scroll ownership and installs after macro choreography but before the handoff", () => {
    const implementation = source();
    const route = routeSource();

    expect(implementation).toContain('addEventListener("scroll", requestRender, { passive: true })');
    expect(implementation).not.toContain("preventDefault");
    expect(implementation).not.toContain("scrollTo(");
    expect(implementation).not.toContain("scrollBy(");
    expect(implementation).not.toContain("supabase");
    expect(implementation).not.toContain("fetch(");

    const micro = route.indexOf("installTerraOsTeaserHostMicroMotion(frame)");
    const mobile = route.indexOf("installTerraOsTeaserMobileHeroSequencing(frame)");
    const handoff = route.indexOf("installTerraOsTeaserHeroHandoff(frame)");
    expect(micro).toBeGreaterThan(-1);
    expect(mobile).toBeGreaterThan(micro);
    expect(handoff).toBeGreaterThan(mobile);
  });
});
