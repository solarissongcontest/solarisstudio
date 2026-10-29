import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const installedAppTabs = source("src/components/app/AppTabBar.tsx");
const publicV3Tabs = source("src/components/v3/V3LiquidTabBar.tsx");
const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");
const pageSwipe = source("src/components/v3/V3TopLevelSwipeSurface.tsx");

describe("V3 browser edge gesture arbitration", () => {
  it("makes every horizontal shell gesture yield before pointer capture at browser edges", () => {
    for (const implementation of [installedAppTabs, publicV3Tabs, organizerTabs, pageSwipe]) {
      expect(implementation).toContain("isV3BrowserEdgeGestureStart");
      expect(implementation).toContain("clientX: event.clientX");
      expect(implementation).toContain("window.innerWidth");
    }
  });

  it("keeps cancellation available after ownership has already been acquired", () => {
    for (const implementation of [installedAppTabs, publicV3Tabs, organizerTabs]) {
      expect(implementation).toContain("onPointerCancel={cancelDrag}");
      expect(implementation).toContain("onLostPointerCapture={cancelDrag}");
    }
    expect(pageSwipe).toContain("onPointerCancel={(event) => finish(event, true)}");
    expect(pageSwipe).toContain("onLostPointerCapture");
  });

  it("does not replace semantic navigation with gesture-only routing", () => {
    expect(installedAppTabs).toContain("<Link");
    expect(publicV3Tabs).toContain("<Link");
    expect(organizerTabs).toContain("<Link");
    expect(installedAppTabs).toContain("aria-current");
    expect(publicV3Tabs).toContain("aria-current");
    expect(organizerTabs).toContain("aria-current");
  });
});
