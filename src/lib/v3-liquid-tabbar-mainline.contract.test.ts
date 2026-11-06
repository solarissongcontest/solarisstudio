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

  it("keeps installed AppTabBar direct manipulation behind synchronous hold engagement", () => {
    const installedTabs = source("src/components/app/AppTabBar.tsx");

    expect(installedTabs).toContain("prefersReducedMotion()");
    expect(installedTabs).toContain("data-solaris-keyboard-open");
    expect(installedTabs).toContain("holdMovementExceeded(");
    expect(installedTabs).toContain("isEngaged: isHoldEngaged");
    expect(installedTabs).toContain("const dragging = held;");
    expect(installedTabs).not.toContain("setDragging(true)");
    const move = installedTabs.slice(installedTabs.indexOf("const moveDrag ="), installedTabs.indexOf("const finishDrag ="));
    expect(move).toContain("if (!isHoldEngaged(event.pointerId))");
    expect(move).toContain("moveHold(event.pointerId, event.clientX, event.clientY)");
    const finish = installedTabs.slice(installedTabs.indexOf("const finishDrag ="), installedTabs.indexOf("const cancelDrag ="));
    expect(finish).toContain("if (!isHoldEngaged(event.pointerId))");
    expect(finish).toContain("suppressClick.current = true;");
  });

  it("recovers pointer and keyboard tab activation after a cancelled lens gesture", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const start = tabs.slice(tabs.indexOf("const startDrag ="), tabs.indexOf("const moveDrag ="));
    expect(start).toMatch(/suppressClick\.current = false;[\s\S]*?if \(/);
    expect(tabs).toContain("if (dragState.current) suppressClick.current = true;");
    expect(tabs).toContain("onKeyDown={() => {");
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

  it("keeps the visible selected lens optically smaller without scaling its physical slot translation", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const liquidCss = source("src/styles/v3-liquid-tabbar.css");

    expect(liquidCss).toContain("--v3-liquid-optical-scale-x: 0.84");
    expect(liquidCss).toContain("--v3-liquid-optical-scale-y: 0.90");
    expect(tabs).toContain("scaleX(var(--v3-liquid-optical-scale-x))");
    expect(tabs).toContain("scaleY(var(--v3-liquid-optical-scale-y))");
    expect(tabs).toMatch(
      /translate3d\([\s\S]*scaleX\(var\(--v3-liquid-scale-x\)\)[\s\S]*scaleX\(var\(--v3-liquid-optical-scale-x\)\)/,
    );
    expect(liquidCss).not.toMatch(/\n\s*scale:\s*0\.84 0\.90/);
    expect(liquidCss).toMatch(
      /data-held="true"[\s\S]*v3-liquid-tabbar__lens[\s\S]*--v3-liquid-optical-scale-x: 0\.98;[\s\S]*--v3-liquid-optical-scale-y: 1\.02/,
    );
    expect(liquidCss).toContain(
      '.v3-liquid-tabbar__material:not([data-held="true"]):has(.v3-liquid-tabbar__item[data-active="true"]:active)',
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

  it("preserves merged #2001 legacy-route bottom clearance without resizing the dock", () => {
    const geometry = source("src/styles/v3-navigation-fixed-geometry.css");
    const adapter = source("src/components/v3/V3LegacyRouteShell.tsx");

    expect(adapter).toContain('data-v3-legacy-bottom-clearance=""');
    expect(geometry).toContain(".v3-legacy-route-bottom-clearance");
    expect(geometry).toContain("var(--v3-bottom-obstruction, 0px) + 24px");
    expect(geometry).toContain("106px + env(safe-area-inset-bottom)");
    expect(geometry).toContain("html[data-solaris-keyboard-open]");
    expect(geometry).toContain("@media (min-width: 1024px)");
    expect(geometry).toContain("--v3-nav-shell-height: 64px");
  });

  it("keeps keyboard, Reduced Motion and Reduced Transparency fallbacks", () => {
    const liquidCss = source("src/styles/v3-liquid-tabbar.css");
    const fixedGeometryCss = source("src/styles/v3-navigation-fixed-geometry.css");
    const organizerCss = source("src/styles/v3-organizer-navigation.css");
    const responsiveCss = source("src/styles/v3-responsive-shell.css");

    expect(liquidCss).toContain("html[data-solaris-keyboard-open]");
    expect(liquidCss).toContain("visibility: hidden");
    expect(liquidCss).toContain("pointer-events: none");
    expect(liquidCss).toMatch(/data-solaris-keyboard-open[\s\S]*pointer-events: none;/);
    expect(fixedGeometryCss).toMatch(/data-solaris-keyboard-open[\s\S]*visibility: hidden;/);
    expect(organizerCss).toMatch(/data-solaris-keyboard-open[\s\S]*visibility: hidden;[\s\S]*pointer-events: none;/);
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
