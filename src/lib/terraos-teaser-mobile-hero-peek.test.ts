import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveTerraOsMobileHeroPeekState } from "./terraos-teaser-mobile-hero-peek";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-mobile-hero-peek.ts"), "utf8");
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS mobile hero phone peek", () => {
  it("keeps a restrained centre-phone hint in the initial viewport", () => {
    const initial = resolveTerraOsMobileHeroPeekState(0);
    const beforeCountdownFade = resolveTerraOsMobileHeroPeekState(0.35);

    expect(initial.active).toBe(true);
    expect(initial.shiftFactor).toBe(1);
    expect(initial.opacity).toBeCloseTo(0.62);
    expect(beforeCountdownFade.shiftFactor).toBe(1);
  });

  it("starts raising the phone while the countdown is fading instead of leaving a dead black gap", () => {
    const start = resolveTerraOsMobileHeroPeekState(0.4);
    const midway = resolveTerraOsMobileHeroPeekState(0.5);
    const risen = resolveTerraOsMobileHeroPeekState(0.58);

    expect(start.shiftFactor).toBe(1);
    expect(midway.shiftFactor).toBeGreaterThan(0);
    expect(midway.shiftFactor).toBeLessThan(1);
    expect(midway.opacity).toBeGreaterThan(0.62);
    expect(risen.shiftFactor).toBe(0);
    expect(risen.opacity).toBe(1);
    expect(risen.active).toBe(true);
  });

  it("keeps ownership through the centre reveal and then yields before the cross-scene handoff", () => {
    const settled = resolveTerraOsMobileHeroPeekState(0.65);
    const released = resolveTerraOsMobileHeroPeekState(0.72);

    expect(settled.shiftFactor).toBe(0);
    expect(settled.opacity).toBe(1);
    expect(settled.active).toBe(true);
    expect(released.active).toBe(false);
    expect(released.shiftFactor).toBe(0);
    expect(released.opacity).toBe(1);
  });

  it("targets only a roughly 26 px centre-phone hint and leaves side phones alone", () => {
    const implementation = source();

    expect(implementation).toContain("const PHONE_PEEK_HEIGHT = 26");
    expect(implementation).toContain('querySelector<HTMLElement>(".hero .phone.center")');
    expect(implementation).toContain("hostWindow.innerHeight - PHONE_PEEK_HEIGHT");
    expect(implementation).not.toContain(".phone.left");
    expect(implementation).not.toContain(".phone.right");
  });

  it("preserves native scrolling and yields before the cross-scene handoff", () => {
    const implementation = source();
    const route = routeSource();

    expect(implementation).toContain('addEventListener("scroll", requestRender, { passive: true })');
    expect(implementation).not.toContain("preventDefault");
    expect(implementation).not.toContain("scrollTo(");
    expect(implementation).not.toContain("scrollBy(");

    const sequence = route.indexOf("installTerraOsTeaserMobileHeroSequencing(frame)");
    const peek = route.indexOf("installTerraOsTeaserMobileHeroPeek(frame)");
    const handoff = route.indexOf("installTerraOsTeaserHeroHandoff(frame)");
    expect(sequence).toBeGreaterThan(-1);
    expect(peek).toBeGreaterThan(sequence);
    expect(handoff).toBeGreaterThan(peek);
  });
});
