import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
const organizerNavigationCss = source("src/styles/v3-organizer-navigation.css");

describe("Organizer V3 navigation interruption ownership", () => {
  it("refuses to start direct manipulation while keyboard, feature overlays, reduced motion or browser edges own interaction", () => {
    expect(organizerTabs).toContain('hasAttribute("data-solaris-keyboard-open")');
    expect(organizerTabs).toContain('hasAttribute("data-solaris-feature-overlay-open")');
    expect(organizerTabs).toContain("prefersReducedMotion()");
    expect(organizerTabs).toContain("isV3BrowserEdgeGestureStart");
    expect(organizerTabs).toContain("window.visualViewport?.width ?? window.innerWidth");
  });

  it("cancels active gestures across pointer, browser and app lifecycle interruptions", () => {
    expect(organizerTabs).toContain("onPointerCancel={cancelDrag}");
    expect(organizerTabs).toContain("onLostPointerCapture={cancelDrag}");
    expect(organizerTabs).toContain('window.addEventListener("blur"');
    expect(organizerTabs).toContain('window.addEventListener("resize"');
    expect(organizerTabs).toContain('window.addEventListener("orientationchange"');
    expect(organizerTabs).toContain('window.addEventListener("pagehide"');
    expect(organizerTabs).toContain("APP_RESUME_EVENT");
    expect(organizerTabs).toContain('document.addEventListener("visibilitychange"');
  });

  it("keeps service-worker activation blocked only while direct manipulation is owned", () => {
    expect(organizerTabs).toContain("setAppUpdateBlocker");
    expect(organizerTabs).toContain("clearAppUpdateBlocker");
    expect(organizerTabs).toContain("V3_ORGANIZER_LENS_UPDATE_BLOCKER");
  });

  it("does not let an unmounting Organizer bar erase a replacement navigation obstruction", () => {
    expect(organizerTabs).toContain("window.requestAnimationFrame");
    expect(organizerTabs).toContain("[data-v3-organizer-tabbar]");
    expect(organizerTabs).toContain("[data-v3-liquid-tabbar]");
    expect(organizerTabs).toContain(".solaris-app-tabbar");
    expect(organizerTabs).toContain('--solaris-bottom-obstruction", "0px"');
  });

  it("uses shared side/bottom safe aliases instead of private platform geometry", () => {
    expect(organizerTabs).toContain("var(--solaris-safe-bottom");
    expect(organizerTabs).toContain('data-v3-organizer-tabbar=""');
    expect(organizerTabs).not.toContain(
      'style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}',
    );
    expect(organizerNavigationCss).toContain("var(--solaris-safe-left");
    expect(organizerNavigationCss).toContain("var(--solaris-safe-right");
    expect(organizerNavigationCss).toContain("var(--solaris-safe-bottom");
  });

  it("keeps compact Organizer destinations at the canonical 44px minimum touch target", () => {
    expect(organizerTabs).toContain('compact ? "h-[3.5rem]" : "h-[4.7rem]"');
    expect(organizerTabs).toContain('compact ? "h-[2.75rem]" : "h-[3.7rem]"');
    expect(organizerTabs).toContain("min-h-[44px]");
    expect(organizerTabs).not.toContain('compact ? "h-[3.35rem]" : "h-[4.7rem]"');
  });

  it("provides visible keyboard focus and a non-refractive Reduce Transparency fallback", () => {
    expect(organizerNavigationCss).toContain("[data-organizer-tab-index]:focus-visible");
    expect(organizerNavigationCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(organizerNavigationCss).toContain("backdrop-filter: none !important");
    expect(organizerNavigationCss).toContain(".solaris-app-tabbar-backdrop");
    expect(organizerNavigationCss).toContain("display: none !important");
  });
});
