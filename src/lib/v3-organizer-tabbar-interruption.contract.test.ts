import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

describe("Organizer V3 navigation interruption ownership", () => {
  it("refuses to start direct manipulation while keyboard or feature overlays own interaction", () => {
    expect(organizerTabs).toContain('hasAttribute("data-solaris-keyboard-open")');
    expect(organizerTabs).toContain('hasAttribute("data-solaris-feature-overlay-open")');
    expect(organizerTabs).toContain("prefersReducedMotion()");
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

  it("uses the shared safe-bottom alias instead of a private platform inset", () => {
    expect(organizerTabs).toContain("var(--solaris-safe-bottom");
    expect(organizerTabs).toContain('data-v3-organizer-tabbar=""');
    expect(organizerTabs).not.toContain(
      'style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}',
    );
  });
});
