import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveTerraOsMobileHeroPeekState } from "./terraos-teaser-mobile-hero-peek";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-mobile-hero-peek.ts"), "utf8");
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS mobile hero phone peek", () => {
  it("keeps a visible centre-phone hint before the main reveal", () => {
    const initial = resolveTerraOsMobileHeroPeekState(0);
    const countdown = resolveTerraOsMobileHeroPeekState(0.5);

    expect(initial.active).toBe(true);
    expect(initial.shiftFactor).toBe(1);
    expect(initial.opacity).toBeCloseTo(0.62);
    expect(countdown.active).toBe(true);
    expect(countdown.shiftFactor).toBe(1);
  });

  it("releases the peek only as the centre-phone reveal takes over", () => {
    const releasing = resolveTerraOsMobileHeroPeekState(0.65);
    const released = resolveTerraOsMobileHeroPeekState(0.72);

    expect(releasing.shiftFactor).toBeGreaterThan(0);
    expect(releasing.shiftFactor).toBeLessThan(1);
    expect(releasing.opacity).toBeGreaterThan(0.62);
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
