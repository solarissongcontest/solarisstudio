import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 shared chrome infrastructure", () => {
  it("keeps AppRuntime as the only live keyboard/viewport writer while overlays expose safe-area aliases", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const overlays = source("src/components/app/AppOverlayManager.tsx");
    const metrics = source("src/components/app/AppChromeMetrics.tsx");
    const viewport = source("src/lib/app-viewport.ts");
    expect(runtime).toContain("createAppViewportController(setViewport)");
    expect(runtime).not.toContain("AppChromeMetrics");
    expect(overlays).toContain("<AppChromeMetrics />");
    expect(metrics).toContain("--solaris-safe-bottom");
    expect(metrics).not.toContain("--solaris-keyboard-inset");
    expect(metrics).not.toContain("window.visualViewport");
    expect(metrics).not.toContain("data-solaris-keyboard-open");
    expect(viewport).toContain("--solaris-keyboard-inset");
    expect(viewport).toContain("--solaris-visual-viewport-height");
    expect(viewport).toContain("data-solaris-keyboard-open");
    expect(viewport).toContain("resolveAppKeyboardViewport");
  });

  it("uses one bottom-obstruction contract across public and Organizer chrome", () => {
    const publicTabs = source("src/components/app/AppTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    const appStyles = source("src/styles/app-shell.css");
    const adminStyles = source("src/admin-desktop.css");
    for (const content of [publicTabs, organizerTabs, appStyles, adminStyles]) {
      expect(content).toContain("--solaris-bottom-obstruction");
    }
    expect(appStyles).toContain("--solaris-keyboard-inset");
    expect(adminStyles).toContain("--solaris-keyboard-inset");
  });

  it("tracks feature overlays across perspectives instead of only public app mode", () => {
    const overlays = source("src/components/app/AppOverlayManager.tsx");
    expect(overlays).toContain("data-solaris-feature-overlay-open");
    expect(overlays).toContain("MutationObserver");
    expect(overlays).not.toContain('if (!isAppMode || typeof document === "undefined") return;');
  });

  it("resets Organizer direct manipulation when the browser interrupts it", () => {
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
    expect(organizerTabs).toContain('window.addEventListener("blur"');
    expect(organizerTabs).toContain('window.addEventListener("orientationchange"');
    expect(organizerTabs).toContain('document.addEventListener("visibilitychange"');
    expect(organizerTabs).toContain("onPointerCancel");
    expect(organizerTabs).toContain("onLostPointerCapture");
  });
});
