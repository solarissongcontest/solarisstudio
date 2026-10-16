import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

function layoutEffectCleanup(effectSource: string, dependencyMarker: string) {
  const effectStart = effectSource.indexOf("useLayoutEffect(() => {");
  const effectEnd = effectSource.indexOf(dependencyMarker, effectStart);
  expect(effectStart).toBeGreaterThanOrEqual(0);
  expect(effectEnd).toBeGreaterThan(effectStart);

  const effect = effectSource.slice(effectStart, effectEnd);
  const cleanupStart = effect.lastIndexOf("return () => {");
  expect(cleanupStart).toBeGreaterThanOrEqual(0);
  return effect.slice(cleanupStart);
}

describe("PR #450 release-blocker regression contracts", () => {
  it("keeps Organizer native form controls at the WCAG 2.2 minimum width", () => {
    const admin = source("src/admin.css");
    expect(admin).toContain("--admin-hit-target-min: 1.5rem");
    expect(admin).toMatch(/\.admin-control-room :is\(input, select, textarea\)[\s\S]*?min-width: var\(--admin-hit-target-min\)/);
  });

  it("keeps interrupted press/drag teardown imperative rather than enqueueing state on unmount", () => {
    const pressHold = source("src/lib/use-solaris-press-hold.ts");
    const publicTabs = source("src/components/app/AppTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(pressHold).toContain("useEffect(() => () => disposeSession()");
    expect(pressHold).not.toContain("useEffect(() => () => end()");
    expect(publicTabs).toContain("resetDragDom();");
    expect(organizerTabs).toContain("resetDragDom();");
    expect(publicTabs).not.toContain("document.removeEventListener(\"visibilitychange\", resetWhenHidden);\n      clearDrag();");
    expect(organizerTabs).not.toContain("document.removeEventListener(\"visibilitychange\", resetWhenHidden);\n      clearDrag();");
  });

  it("publishes bottom obstruction before paint and does not zero it between dependency reruns", () => {
    const publicTabs = source("src/components/app/AppTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(publicTabs).toContain("useLayoutEffect(() => {");
    expect(organizerTabs).toContain("useLayoutEffect(() => {");

    const publicCleanup = layoutEffectCleanup(publicTabs, "}, [collapsed, pathname]);");
    const organizerCleanup = layoutEffectCleanup(
      organizerTabs,
      "}, [collapsed, mode, pathname]);",
    );

    expect(publicCleanup).not.toContain('setProperty("--solaris-bottom-obstruction", "0px")');
    expect(organizerCleanup).not.toContain('setProperty("--solaris-bottom-obstruction", "0px")');

    // True unmount cleanup remains separate, so replacement layout effects keep
    // the last valid obstruction until the next pre-paint measurement lands.
    expect(publicTabs).toMatch(/useEffect\([\s\S]*--solaris-bottom-obstruction[\s\S]*\[\],\s*\);/);
    expect(organizerTabs).toMatch(/useEffect\([\s\S]*--solaris-bottom-obstruction[\s\S]*\[\],\s*\);/);
  });

  it("keeps visual reference capture in a real reduced-motion browser context", () => {
    const config = source("playwright.config.ts");
    const personality = source("e2e/personality-contract.e2e.ts");
    const configStart = config.indexOf("export default defineConfig({");
    const useStart = config.indexOf(
      '  use: {\n    ...devices["Desktop Chrome"],',
      configStart,
    );
    const useEnd = config.indexOf("\n  webServer:", useStart);

    expect(configStart).toBeGreaterThanOrEqual(0);
    expect(useStart).toBeGreaterThan(configStart);
    expect(useEnd).toBeGreaterThan(useStart);

    const desktopUse = config.slice(useStart, useEnd);
    const deviceIndex = desktopUse.indexOf('...devices["Desktop Chrome"]');
    const reducedIndex = desktopUse.indexOf('reducedMotion: "reduce"');

    expect(deviceIndex).toBeGreaterThanOrEqual(0);
    expect(reducedIndex).toBeGreaterThan(deviceIndex);
    expect(personality).toContain('matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(personality).not.toContain("for (let attempt = 0; attempt < 3 && !screenshot");
  });
});
