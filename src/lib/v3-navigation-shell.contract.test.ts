import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation shell acceptance guardrails", () => {
  it("pre-measures drag geometry instead of forcing layout reads for every pointer pixel", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("const rects = tabRects();");
      expect(tabs).toContain("slotWidth: origin.width");
      expect(tabs).toContain("slotWidth: drag.slotWidth");
      expect(tabs).toContain("minDelta: drag.minDelta");
      expect(tabs).toContain("maxDelta: drag.maxDelta");
      expect(tabs).toContain("maxSteps: 1");
      expect(tabs).toContain("rubberBand: true");
    }
  });

  it("prevents completed long press from falling through into navigation", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("const longPressed = held");
      expect(tabs).toContain("suppressClick.current = drag.moved || longPressed");
      expect(tabs).toContain("if (longPressed ||");
    }
  });

  it("uses one canonical destination model while desktop stops rendering the phone bar", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const desktop = source("src/components/v3/V3DesktopPrimaryNavigation.tsx");
    const responsive = source("src/styles/v3-responsive-shell.css");

    expect(shell).toContain("<V3DesktopPrimaryNavigation");
    expect(shell).toContain("destinations={liquidDestinations}");
    expect(desktop).toContain('aria-label="Primary app navigation"');
    expect(desktop).toContain('aria-current={destination.active ? "page" : undefined}');
    expect(responsive).toContain("@media (min-width: 1024px)");
    expect(responsive).toContain(".v3-bottom-nav.v3-liquid-tabbar");
    expect(responsive).toContain("display: none !important");
    expect(responsive).toContain("width: min(100%, 76rem)");
  });

  it("keeps Organizer glass bounded and removes mobile chrome when the keyboard opens", () => {
    const organizer = source("src/components/admin/OrganizerV6TabBar.tsx");
    const css = source("src/styles/v3-organizer-navigation.css");

    expect(organizer).toContain('data-v6-organizer-tabbar=""');
    expect(organizer).toContain('data-solaris-keyboard-open');
    expect(css).toContain("background: transparent !important");
    expect(css).toContain('html[data-solaris-keyboard-open]');
    expect(css).toContain("pointer-events: none");
  });

  it("keeps critical task chrome separate and blocks unsafe service-worker activation", () => {
    const focused = source("src/components/v3/V3FocusedTaskShell.tsx");
    const gesture = source("src/lib/v3-navigation-gesture.ts");

    expect(focused).toContain("setAppUpdateBlocker");
    expect(focused).toContain("clearAppUpdateBlocker");
    expect(focused).toContain('data-v3-swipe-owner="content"');
    expect(gesture).toContain('if (screen.behavior.criticalTask) return "critical-flow"');
  });

  it("does not enable page swipe until live adjacent DOM surfaces are available", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(swipe).toContain("previewReady = false");
    expect(swipe).toContain('policy === "enabled" && previewReady');
    expect(swipe).toContain("data-v3-top-level-swipe-preview-ready");
    expect(shell).not.toContain("previewReady={true}");
  });
});
