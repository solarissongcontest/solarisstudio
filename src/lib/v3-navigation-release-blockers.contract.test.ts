import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveV3TopLevelSwipePolicy } from "@/lib/v3-navigation-gesture";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 navigation release-blocker invariants", () => {
  it("fails closed for critical and immersive workflows", () => {
    expect(resolveV3TopLevelSwipePolicy("/jury-voting")).toBe("critical-flow");
    expect(resolveV3TopLevelSwipePolicy("/televoting")).toBe("critical-flow");
    expect(resolveV3TopLevelSwipePolicy("/confirmations")).toBe("critical-flow");
    expect(resolveV3TopLevelSwipePolicy("/integrity/report/category")).toBe("critical-flow");
    expect(resolveV3TopLevelSwipePolicy("/show-mode")).toBe("disabled");
  });

  it("keeps retained preview pages outside the accessibility and pointer trees", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const css = source("src/styles/v3-top-level-swipe.css");

    expect(swipe).toContain('aria-hidden={canonicalSlot === "previous" ? undefined : true}');
    expect(swipe).toContain('inert={canonicalSlot !== "previous"}');
    expect(swipe).toContain('aria-hidden={canonicalSlot === "current" ? undefined : true}');
    expect(swipe).toContain('inert={canonicalSlot !== "current"}');
    expect(swipe).toContain('aria-hidden={canonicalSlot === "next" ? undefined : true}');
    expect(swipe).toContain('inert={canonicalSlot !== "next"}');
    expect(css).toMatch(/page--previous,[\s\S]*page--next[\s\S]*pointer-events: none/);
  });

  it("clears gesture-owned transforms and progress after every interruption path", () => {
    const swipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(swipe).toContain('track.style.setProperty("--v3-page-swipe-x", "0px")');
    expect(swipe).toContain('material?.style.setProperty("--v3-liquid-drag-x", "0px")');
    expect(swipe).toContain('root.removeAttribute("data-v3-navigation-progress-owner")');
    expect(swipe).toContain("releasePointerCapture");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("releasePointerCapture");
      expect(tabs).toContain('window.addEventListener("pagehide"');
      expect(tabs).toContain("APP_RESUME_EVENT");
      expect(tabs).toContain('data-solaris-feature-overlay-open');
      expect(tabs).toContain('data-solaris-keyboard-open');
    }
  });

  it("invalidates Public gesture ownership when viewer identity changes", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const cacheIsolation = source("src/lib/account-cache-isolation.ts");

    expect(shell).toContain("const navigationInteractionKey = navigationIdentityReady");
    expect(shell).toContain('(navigationScope ?? "anonymous")');
    expect(shell).toContain(': "resolving"');
    expect(shell).toContain("interactionKey={navigationInteractionKey}");
    expect(shell).toContain("key={navigationInteractionKey}");
    expect(cacheIsolation).toContain("previousUserId !== nextUserId");
    expect(cacheIsolation).toContain("clearPrivateAccountQueries(client)");
    expect(cacheIsolation).toContain("v3-rollout-probe");
  });

  it("keeps browser certification hard-wired to loopback Supabase", () => {
    for (const path of [
      "e2e/v3-navigation/installed-app.e2e.ts",
      "e2e/v3-navigation/route-memory-installed-app.e2e.ts",
      "e2e/v3-navigation/geometry-report-installed-app.e2e.ts",
      "e2e/v3-navigation/frame-profile-installed-app.e2e.ts",
    ]) {
      const test = source(path);
      expect(test).toContain("127.0.0.1");
      expect(test).toContain("localhost");
      expect(test).toMatch(/Refusing V3/);
      expect(test).not.toContain("supabase.co");
    }
  });
});
