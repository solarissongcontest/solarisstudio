import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Source-only contract tests: no browser, hosted Supabase or network access.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const installed = read("src/components/app/AppTabBar.tsx");
const liquid = read("src/components/v3/V3LiquidTabBar.tsx");

describe("V3 installed dock interrupted gesture recovery", () => {
  for (const [name, source] of [
    ["installed AppTabBar", installed],
    ["V3 LiquidTabBar", liquid],
  ] as const) {
    it(name + " resets suppressed clicks before a new pointer's eligibility check", () => {
      const start = source.slice(source.indexOf("const startDrag ="), source.indexOf("const moveDrag ="));
      expect(start).toMatch(/suppressClick\.current = false;[\s\S]*?if \(/);
      expect(source).toContain("onPointerCancel={cancelDrag}");
      expect(source).toContain("onLostPointerCapture={cancelDrag}");
    });

    it(name + " isolates keyboard and synthetic activation from cancelled touch", () => {
      expect(source).toContain("onKeyDown={() => {");
      expect(source).toMatch(/onKeyDown=\{\(\) => \{[\s\S]*?suppressClick\.current = false;/);
      expect(source).toContain("if (dragState.current) suppressClick.current = true;");
      expect(source).toMatch(/if \(suppressClick\.current\) \{[\s\S]*?suppressClick\.current = false;[\s\S]*?event\.preventDefault\(\);/);
    });

    it(name + " rejects drag initiation behind keyboard or feature overlays", () => {
      const start = source.slice(source.indexOf("const startDrag ="), source.indexOf("const moveDrag ="));
      expect(start).toContain("data-solaris-keyboard-open");
      expect(start).toContain("data-solaris-feature-overlay-open");
    });
  }

  it("installed AppTabBar releases captured pointers before forgetting drag ownership", () => {
    expect(installed).toContain("captureTarget: HTMLAnchorElement");
    expect(installed).toContain("captureTarget: event.currentTarget");
    const reset = installed.slice(installed.indexOf("const resetDragDom ="), installed.indexOf("const clearDrag ="));
    expect(reset).toMatch(/dragState\.current = null;[\s\S]*drag\.captureTarget\.releasePointerCapture\?\.\(drag\.pointerId\)/);
  });

  it("installed AppTabBar cancels and disposes every lifecycle interruption", () => {
    for (const event of ["blur", "resize", "orientationchange", "pagehide"]) {
      expect(installed).toContain('window.addEventListener("' + event + '", resetInterruptedGesture)');
      expect(installed).toContain('window.removeEventListener("' + event + '", resetInterruptedGesture)');
    }
    expect(installed).toContain('window.visualViewport?.addEventListener("resize", resetInterruptedGesture)');
    expect(installed).toContain('window.visualViewport?.removeEventListener("resize", resetInterruptedGesture)');
    expect(installed).toContain("window.addEventListener(APP_RESUME_EVENT, resetInterruptedGesture)");
    expect(installed).toContain("window.removeEventListener(APP_RESUME_EVENT, resetInterruptedGesture)");
    expect(installed).toContain("interruptionObserver?.disconnect()");
    expect(installed).toContain("data-solaris-feature-overlay-open");
    expect(installed).toContain("data-solaris-keyboard-open");
  });


  it("removes keyboard-obscured public and Organizer navigation from the focus order", () => {
    const geometry = read("src/styles/v3-navigation-fixed-geometry.css");
    const organizer = read("src/styles/v3-organizer-navigation.css");
    const installedKeyboardRule = geometry.match(
      /html\[data-solaris-keyboard-open\] \[data-solaris-v3\] \.v3-bottom-nav\.v3-liquid-tabbar \{([^}]*)\}/,
    )?.[1];
    const organizerKeyboardRule = organizer.match(
      /html\[data-solaris-keyboard-open\] \.admin-mobile-nav\[data-v6-organizer-tabbar\] \{([^}]*)\}/,
    )?.[1];

    expect(installedKeyboardRule).toContain("visibility: hidden;");
    expect(organizerKeyboardRule).toContain("visibility: hidden;");
    expect(organizerKeyboardRule).toContain("pointer-events: none;");
  });

  it("keeps V3 Liquid gesture teardown and live-update safeguards intact", () => {
    expect(liquid).toContain("clearAppUpdateBlocker(V3_LIQUID_LENS_UPDATE_BLOCKER)");
    expect(liquid).toContain("setAppUpdateBlocker(");
    expect(liquid).toContain("resetInterruptedGesture();");
    expect(liquid).toContain('window.visualViewport?.addEventListener("resize", resetInterruptedGesture)');
    expect(liquid).toContain('window.visualViewport?.removeEventListener("resize", resetInterruptedGesture)');
    expect(liquid).toContain("rootInterruptionObserver?.disconnect()");
    expect(liquid).toContain("onLostPointerCapture={cancelDrag}");
  });
});
