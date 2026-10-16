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
      expect(tabs).toMatch(
        /suppressClick\.current = (?:drag\.moved|moved) \|\| longPressed/,
      );
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

  it("announces navigation badge counts once on public and Organizer surfaces", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const desktop = source("src/components/v3/V3DesktopPrimaryNavigation.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(publicTabs).toContain("navigationItemLabel(destination.label, badge)");
    expect(desktop).toContain("navigationItemLabel(destination.label, badge)");
    expect(organizerTabs).toContain("organizerItemLabel(item)");
    expect(organizerTabs).not.toContain("aria-label={`${item.badge} unresolved item");
    expect(organizerTabs).toMatch(/v6-organizer-tabbar[\s\S]*aria-hidden="true"/);
    expect(shell).toContain("const notificationLabel =");
    expect(shell).toContain("aria-label={notificationLabel}");
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

  it("composes at most live previous/current/next surfaces from one navigation progress", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const shell = source("src/components/v3/V3AppShell.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(swipe).toContain("previewReady = false");
    expect(swipe).toContain("requiredAdjacentSurfacesReady");
    expect(swipe).toContain('policy === "enabled" && previewReady && requiredAdjacentSurfacesReady');
    expect(swipe).toContain("--v3-navigation-progress");
    expect(swipe).toContain("const progress = activeIndex - offset / drag.viewportWidth");
    expect(swipe).toContain("lensStepWidth");
    expect(swipe).toContain('data-v3-swipe-preview="previous"');
    expect(swipe).toContain('data-v3-swipe-preview="next"');
    expect(swipe).toMatch(/aria-hidden="true"\s+inert\s+data-v3-swipe-preview="previous"/);
    expect(swipe).toMatch(/aria-hidden="true"\s+inert\s+data-v3-swipe-preview="next"/);
    expect(swipe).not.toMatch(/screenshot|canvas\.toDataURL|html2canvas/i);
    expect(shell).toContain("swipePreviewSurfaces?: V3TopLevelSwipePreviewSurfaces");
    expect(shell).toContain("previousSurface={swipePreviewSurfaces?.previous}");
    expect(shell).toContain("nextSurface={swipePreviewSurfaces?.next}");
    expect(shell).toContain("previewReady={swipePreviewReady}");
    expect(css).toContain(".v3-top-level-swipe-page--previous");
    expect(css).toContain(".v3-top-level-swipe-page--next");
    expect(css).toContain('data-v3-page-settling="true"');
    expect(css).toContain("--v3-tab-visual-opacity");
    expect(css).toContain("--v3-tab-visual-scale");
  });

  it("cancels page manipulation when shell ownership or lifecycle changes", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(swipe).toContain("APP_RESUME_EVENT");
    expect(swipe).toContain('"data-solaris-feature-overlay-open"');
    expect(swipe).toContain('"data-solaris-keyboard-open"');
    expect(swipe).toContain('window.addEventListener("pagehide", interrupt)');
    expect(swipe).toContain("rootInterruptionObserver.observe");
    expect(swipe).toContain("shellInteractionBlocked()");
    expect(swipe).toContain("interactionKey?: string | null");
    expect(swipe).toContain("committedInteractionKeyRef.current === interactionKey");
    expect(swipe).toContain("surface.releasePointerCapture?.(drag.pointerId)");
    expect(shell).toContain("interactionKey={navigationScope}");
  });

  it("commits a winning swipe promptly while preserving one visual settle", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(swipe).toContain("type SettlingComposition");
    expect(swipe).toContain("currentSurface: children");
    expect(swipe).toContain("committedTargetRef.current = targetIndex");
    expect(swipe).toMatch(
      /publishVisualProgress\(targetIndex, drag, "settle"\);\s+onCommit\(targetIndex\);\s+settleTimerRef\.current = window\.setTimeout/,
    );
    expect(swipe).toContain("visualCurrentSurface = settlingComposition?.currentSurface ?? children");
    expect(shell).toContain("void navigateToTarget();");
    expect(shell).not.toContain("Promise.resolve(navigateToTarget()).then");
  });

  it("hands focus to canonical page content after a committed swipe settles", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain("function focusCurrentRouteAfterSwipe()");
    expect(shell).toContain('target.setAttribute("tabindex", "-1")');
    expect(shell).toContain("target.focus({ preventScroll: true })");
    expect(shell).toContain("onSettled={() => focusCurrentRouteAfterSwipe()}");
  });
});
