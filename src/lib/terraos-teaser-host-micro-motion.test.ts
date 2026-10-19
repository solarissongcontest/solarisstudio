import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeTerraOsScrollVelocity } from "./terraos-teaser-host-micro-motion";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-host-micro-motion.ts"), "utf8");
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS release micro-motion", () => {
  it("bounds scroll velocity symmetrically", () => {
    expect(normalizeTerraOsScrollVelocity(0, 16)).toBe(0);
    expect(normalizeTerraOsScrollVelocity(18, 10)).toBe(1);
    expect(normalizeTerraOsScrollVelocity(-18, 10)).toBe(-1);
    expect(normalizeTerraOsScrollVelocity(9, 10)).toBeCloseTo(0.5);
    expect(normalizeTerraOsScrollVelocity(Number.NaN, 16)).toBe(0);
    expect(normalizeTerraOsScrollVelocity(12, Number.NaN)).toBe(0);
  });

  it("observes native scrolling without owning or intercepting it", () => {
    const implementation = source();
    expect(implementation).toContain('addEventListener("scroll", onScroll, { passive: true })');
    expect(implementation).not.toContain('addEventListener("wheel"');
    expect(implementation).not.toContain('addEventListener("touchmove"');
    expect(implementation).not.toContain("preventDefault");
    expect(implementation).not.toContain("scrollTo(");
    expect(implementation).not.toContain("scrollBy(");
  });

  it("uses one bounded velocity signal for tilt, optical origin and glass highlight", () => {
    const implementation = source();
    expect(implementation).toContain("--terraos-scroll-velocity");
    expect(implementation).toContain("--terraos-scroll-tilt");
    expect(implementation).toContain("--terraos-scroll-origin-x");
    expect(implementation).toContain("--terraos-scroll-glint-x");
    expect(implementation).toContain("--terraos-scroll-glint-opacity");
    expect(implementation).toContain("targetVelocity *= 0.82");
  });

  it("collapses the effect under Reduce Motion", () => {
    const implementation = source();
    expect(implementation).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(implementation).toContain('terraosMicroMotion = reducedMotion.matches ? "reduced" : "true"');
    expect(implementation).toContain("reset();");
    expect(implementation).toContain('data-terraos-micro-motion="reduced"');
  });

  it("installs only from a full Home fixture preview and performs no product I/O", () => {
    const route = routeSource();
    const implementation = source();
    expect(route).toContain("installTerraOsTeaserHostMicroMotion");
    expect(route).toContain('screen !== "home" || chrome === "content"');
    expect(implementation).not.toContain("supabase");
    expect(implementation).not.toContain("fetch(");
  });
});
