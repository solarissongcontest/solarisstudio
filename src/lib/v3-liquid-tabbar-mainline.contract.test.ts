import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("canonical V3 Liquid tab bar mainline cutover", () => {
  it("keeps the bar icon-only without hiding semantic names", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const css = source("src/styles/v3-liquid-tabbar.css");

    expect(tabs).toContain('aria-label={navigationItemLabel(destination.label, badge)}');
    expect(tabs).toContain('aria-current={active ? "page" : undefined}');
    expect(tabs).toContain('className="v3-liquid-tabbar__label"');
    expect(css).toMatch(/v3-liquid-tabbar__label[\s\S]*position: absolute;[\s\S]*clip-path: inset\(50%\)/);
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

  it("uses the quieter visual-cutover geometry while preserving 44px compact targets", () => {
    const css = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(css).toContain("width: min(calc(100% - 36px), 428px)");
    expect(css).toContain("height: 58px");
    expect(css).toContain("left: 6px !important");
    expect(css).toContain("right: auto !important");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("width: min(286px");
  });

  it("keeps keyboard, Reduced Motion and Reduced Transparency fallbacks", () => {
    const liquidCss = source("src/styles/v3-liquid-tabbar.css");
    const geometryCss = source("src/styles/v3-navigation-fixed-geometry.css");
    const responsiveCss = source("src/styles/v3-responsive-shell.css");

    expect(liquidCss).toContain("html[data-solaris-keyboard-open]");
    expect(geometryCss).toContain("visibility: hidden");
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
