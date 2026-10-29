import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Public installed-app tab bar interaction contract", () => {
  const tabs = source("src/components/app/AppTabBar.tsx");

  it("keeps direct manipulation bounded, elastic and adjacent", () => {
    expect(tabs).toContain("rubberBand: true");
    expect(tabs).toContain("velocityProjectionMs: 110");
    expect(tabs.match(/maxSteps: 1/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(tabs).toContain("velocityX: drag.velocityX");
  });

  it("keeps drag optional for reduced-motion and keyboard users", () => {
    expect(tabs).toContain("prefersReducedMotion()");
    expect(tabs).toContain('root.hasAttribute("data-solaris-keyboard-open")');
    expect(tabs).toContain('root.hasAttribute("data-solaris-feature-overlay-open")');
  });

  it("cancels gestures on browser, overlay, keyboard and app-resume interruptions", () => {
    expect(tabs).toContain("MutationObserver");
    expect(tabs).toContain('window.addEventListener("blur"');
    expect(tabs).toContain('window.addEventListener("resize"');
    expect(tabs).toContain('window.addEventListener("orientationchange"');
    expect(tabs).toContain('window.addEventListener("pagehide"');
    expect(tabs).toContain("APP_RESUME_EVENT");
    expect(tabs).toContain('document.addEventListener("visibilitychange"');
  });

  it("blocks unsafe service-worker activation while pointer capture is active", () => {
    expect(tabs).toContain("setAppUpdateBlocker");
    expect(tabs).toContain("clearAppUpdateBlocker");
    expect(tabs).toContain("APP_TABBAR_GESTURE_UPDATE_BLOCKER");
  });

  it("prevents long press from accidentally activating the current tab", () => {
    expect(tabs).toContain("const longPressed = held");
    expect(tabs).toContain("suppressClick.current = moved || longPressed");
    expect(tabs).toContain("if (longPressed || !moved || targetIndex === drag.originIndex) return");
  });

  it("drops bottom obstruction while the keyboard owns the lower viewport", () => {
    expect(tabs).toContain('root.hasAttribute("data-solaris-keyboard-open")');
    expect(tabs).toContain('attributeFilter: ["data-solaris-keyboard-open"]');
    expect(tabs).toContain('--solaris-app-bottom-obstruction", "0px"');
    expect(tabs).toContain('--solaris-bottom-obstruction", "0px"');
  });

  it("includes attention counts in the semantic destination name without double-announcing the badge", () => {
    expect(tabs).toContain("const accessibleLabel =");
    expect(tabs).toContain("need attention");
    expect(tabs).toContain("aria-label={accessibleLabel}");
    expect(tabs).toContain('className="solaris-app-tab-badge" aria-hidden="true"');
  });
});
