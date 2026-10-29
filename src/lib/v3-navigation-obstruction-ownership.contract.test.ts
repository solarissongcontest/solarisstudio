import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const appTabs = source("src/components/app/AppTabBar.tsx");
const publicV3Tabs = source("src/components/v3/V3LiquidTabBar.tsx");
const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

const SHARED_OWNERS = [
  "[data-v3-liquid-tabbar]",
  "[data-v3-organizer-tabbar]",
  ".solaris-app-tabbar",
] as const;

describe("shared navigation obstruction ownership", () => {
  it("gives every persistent navigation implementation an explicit owner marker", () => {
    expect(appTabs).toContain("solaris-app-tabbar");
    expect(publicV3Tabs).toContain('data-v3-liquid-tabbar=""');
    expect(organizerTabs).toContain('data-v3-organizer-tabbar=""');
  });

  it("prevents V3 Public cleanup from erasing another navigation owner's measurement", () => {
    expect(publicV3Tabs).toContain("window.requestAnimationFrame");
    for (const owner of SHARED_OWNERS) expect(publicV3Tabs).toContain(owner);
    expect(publicV3Tabs).toContain("--v3-bottom-obstruction");
    expect(publicV3Tabs).toContain("--solaris-bottom-obstruction");
  });

  it("prevents Organizer cleanup from erasing another navigation owner's measurement", () => {
    expect(organizerTabs).toContain("window.requestAnimationFrame");
    for (const owner of SHARED_OWNERS) expect(organizerTabs).toContain(owner);
    expect(organizerTabs).toContain("--solaris-bottom-obstruction");
  });

  it("prevents legacy installed-app cleanup from erasing V3 replacement owners", () => {
    expect(appTabs).toContain("window.requestAnimationFrame");
    expect(appTabs).toContain("[data-v3-liquid-tabbar]");
    expect(appTabs).toContain("[data-v3-organizer-tabbar]");
    expect(appTabs).toContain("--solaris-app-bottom-obstruction");
    expect(appTabs).toContain("--solaris-bottom-obstruction");
  });

  it("lets keyboard ownership remove each mobile obstruction without inventing a second keyboard detector", () => {
    for (const tabs of [appTabs, publicV3Tabs, organizerTabs]) {
      expect(tabs).toContain('hasAttribute("data-solaris-keyboard-open")');
      expect(tabs).toContain("--solaris-bottom-obstruction");
      expect(tabs).not.toContain("innerHeight - visualViewport");
    }
  });
});
