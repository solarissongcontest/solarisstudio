import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveTerraOsMobileHeroPeekState,
  resolveTerraOsMobilePhonePeekHeight,
} from "./terraos-teaser-mobile-hero-peek";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/terraos-teaser-mobile-hero-peek.ts"), "utf8");
const routeSource = () =>
  readFileSync(resolve(process.cwd(), "src/routes/terraos-teaser-preview.tsx"), "utf8");

describe("TerraOS mobile hero phone peek", () => {
  it("keeps an unmistakable centre-phone preview in the initial viewport", () => {
    const initial = resolveTerraOsMobileHeroPeekState(0);
    const beforeRelease = resolveTerraOsMobileHeroPeekState(0.3);

    expect(initial.active).toBe(true);
    expect(initial.shiftFactor).toBe(1);
    expect(initial.opacity).toBeCloseTo(0.82);
    expect(beforeRelease.shiftFactor).toBe(1);
  });

  it("scales the initial preview to a useful visible slice instead of a 26 px sliver", () => {
    expect(resolveTerraOsMobilePhonePeekHeight(700)).toBe(112);
    expect(resolveTerraOsMobilePhonePeekHeight(1334)).toBeCloseTo(140.07, 1);
    expect(resolveTerraOsMobilePhonePeekHeight(2000)).toBe(148);
  });

  it("raises the phone during the countdown fade", () => {
    const start = resolveTerraOsMobileHeroPeekState(0.32);
    const moving = resolveTerraOsMobileHeroPeekState(0.4);
    const mostlyRisen = resolveTerraOsMobileHeroPeekState(0.5);
    const risen = resolveTerraOsMobileHeroPeekState(0.58);

    expect(start.shiftFactor).toBe(1);
    expect(moving.shiftFactor).toBeLessThan(1);
    expect(moving.shiftFactor).toBeGreaterThan(0.5);
    expect(mostlyRisen.shiftFactor).toBeLessThan(0.3);
    expect(mostlyRisen.opacity).toBeGreaterThan(0.94);
    expect(risen.shiftFactor).toBe(0);
    expect(risen.opacity).toBe(1);
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

  it("uses the visible viewport on iOS and leaves side phones alone", () => {
    const implementation = source();

    expect(implementation).toContain("PHONE_PEEK_MIN_HEIGHT = 112");
    expect(implementation).toContain("PHONE_PEEK_MAX_HEIGHT = 148");
    expect(implementation).toContain("hostWindow.visualViewport");
    expect(implementation).toContain("visualViewport.offsetTop + visualViewport.height");
    expect(implementation).toContain('querySelector<HTMLElement>(".hero .phone.center")');
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
