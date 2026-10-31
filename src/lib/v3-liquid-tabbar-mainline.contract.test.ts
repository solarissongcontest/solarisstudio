import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical V3 Liquid tab bar mainline cutover", () => {
  it("keeps the five-tab control icon-only without hiding semantic names", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const css = source("src/styles/v3-liquid-tabbar.css");

    expect(tabs).toContain('aria-label={navigationItemLabel(destination.label, badge)}');
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
    expect(tabs).toContain('className="v3-liquid-tabbar__label"');
    expect(css).toMatch(
      /v3-liquid-tabbar__label[\s\S]*position: absolute;[\s\S]*clip-path: inset\(50%\)/,
    );
  });

  it("keeps direct-lens dragging adjacent-only with bounded edge physics", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(tabs).toContain("resolveElasticDrag({");
    expect(tabs).toContain("rubberBand: true");
    expect(tabs).toMatch(/activationRatio: 0\.72,[\s\S]*maxSteps: 1/);
    expect(tabs).toContain("velocityProjectionMs: 110");
    expect(tabs).toContain("onPointerCancel={cancelDrag}");
    expect(tabs).toContain("onLostPointerCapture={cancelDrag}");
  });

  it("keeps the pointer-move hot path free of layout reads", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const moveStart = tabs.indexOf("const moveDrag =");
    const moveEnd = tabs.indexOf("const selectDestination =", moveStart);
    const move = tabs.slice(moveStart, moveEnd);

    expect(move).not.toContain("getBoundingClientRect");
    expect(move).not.toContain("querySelectorAll");
    expect(tabs).toContain("// Pre-measure once at gesture start.");
  });

  it("replaces the former giant dock geometry with the compact floating capsule contract", () => {
    const geometry = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(geometry).toContain("--v3-nav-outer-inline: 14px");
    expect(geometry).toContain("--v3-nav-bottom-comfort: 10px");
    expect(geometry).toContain("--v3-nav-shell-height: 64px");
    expect(geometry).toContain("--v3-nav-max-width: 414px");
    expect(geometry).toContain("--v3-nav-lens-height: 50px");
    expect(geometry).toContain("height: 54px");
    expect(geometry).toContain("min-height: 44px");

    // Negative reference: these values were the production geometry before the
    // complete redesign and must not silently return.
    expect(geometry).not.toContain("height: 70px");
    expect(geometry).not.toContain("calc(100% - 22px)");
    expect(geometry).not.toContain("left: max(11px");
    expect(geometry).not.toContain("width: min(324px");
  });

  it("keeps the visible selected lens optically smaller than the hit slot and physically expressive", () => {
    const liquidCss = source("src/styles/v3-liquid-tabbar.css");

    expect(liquidCss).toContain("scale: 0.84 0.90");
    expect(liquidCss).toMatch(
      /data-held="true"[\s\S]*v3-liquid-tabbar__lens[\s\S]*scale: 0\.98 1\.02/,
    );
    expect(liquidCss).toContain("data-dragging=\"true\"");
    expect(liquidCss).toContain("backdrop-filter: blur(14px) saturate(160%) brightness(1.075)");
    expect(liquidCss).not.toContain("height: 4.35rem");
    expect(liquidCss).not.toContain("width: min(calc(100% - 1.4rem), 34rem)");
  });

  it("has one navbar style owner instead of legacy geometry plus late shell overrides", () => {
    const geometry = source("src/styles/v3-navigation-fixed-geometry.css");
    const shellCss = source("src/styles/v3-shared-public-shell-completion.css");

    expect(geometry).toContain("single owner of visible mobile navbar geometry");
    expect(shellCss).not.toContain(".v3-liquid-tabbar__material");
    expect(shellCss).not.toContain(".v3-liquid-tabbar__lens");
    expect(shellCss).not.toContain(".v3-bottom-nav.v3-liquid-tabbar");
    expect(shellCss).toContain("--v3-top-system-safe");
  });

  it("keeps safe-area placement and canonical shell-owned content clearance", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const geometry = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(geometry).toContain(
      "bottom: calc(env(safe-area-inset-bottom) + var(--v3-nav-bottom-comfort))",
    );
    expect(geometry).toContain(
      "padding-bottom: calc(var(--v3-bottom-obstruction, 108px) + 14px)",
    );
    expect(tabs).toContain('root.style.setProperty("--v3-bottom-obstruction"');
    expect(tabs).toContain('root.style.setProperty("--solaris-bottom-obstruction"');
  });

  it("keeps keyboard, Reduced Motion and Reduced Transparency fallbacks", () => {
    const liquidCss = source("src/styles/v3-liquid-tabbar.css");
    const responsiveCss = source("src/styles/v3-responsive-shell.css");

    expect(liquidCss).toContain("html[data-solaris-keyboard-open]");
    expect(liquidCss).toContain("visibility: hidden");
    expect(liquidCss).toContain("pointer-events: none");
    expect(liquidCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(liquidCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(responsiveCss).toContain("@media (min-width: 1024px)");
    expect(responsiveCss).toContain("display: none !important");
    expect(responsiveCss).toContain(".v3-desktop-primary-nav");
  });

  it("does not smuggle whole-page swipe into the foundation cutover", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).not.toContain("V3TopLevelSwipeSurface");
    expect(shell).not.toContain("swipePreviewSurfaces");
    expect(shell).toContain("safe live adjacent DOM surfaces");
    expect(shell).toContain("duplicate data graphs");
  });
});
