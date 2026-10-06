import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

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
    expect(publicTabs).toContain("True unmount cleanup below owns the reset");
    expect(organizerTabs).toContain("unmount reset");
  });

  it("keeps visual reference capture in a real reduced-motion browser context", () => {
    const config = source("playwright.config.ts");
    const personality = source("e2e/personality-contract.e2e.ts");
    const deviceIndex = config.indexOf('...devices["Desktop Chrome"]');
    const reducedIndex = config.indexOf('reducedMotion: "reduce"');

    expect(deviceIndex).toBeGreaterThanOrEqual(0);
    expect(reducedIndex).toBeGreaterThan(deviceIndex);
    expect(personality).toContain('matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(personality).not.toContain("for (let attempt = 0; attempt < 3 && !screenshot");
  });
});
