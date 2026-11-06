import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("three-experience web shell ownership", () => {
  it("gives browsers header/drawer navigation instead of an installed-app dock", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('aria-label="Mobile website navigation"');
    expect(shell).toContain('aria-label="Open navigation"');
    expect(shell).toContain('<PublicDrawerNavigation pathname={pathname} user={publicUser} />');
    expect(shell).toContain('<PublicBreadcrumbs pathname={pathname} />');
    expect(shell).not.toContain('className="mobile-quick-nav');
    expect(shell).not.toContain("mobile_bottom");
  });

  it("retains the app-only tabbar and reserves obstruction space only in app mode", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain('{isAppMode && appChrome.tabBar !== "hidden" ? (');
    expect(shell).toContain("<AppTabBar");
    expect(shell).toContain('isAppMode ? "pb-24 sm:pb-24" : "pb-8 sm:pb-12"');
    expect(shell).toContain('{!isAppMode ? (');
    expect(shell).toContain('<header className="site-nav');
  });

  it("preserves Playwright isolation and canonical platform identity", () => {
    const config = source("playwright.config.ts");
    const platform = source("src/lib/platform.ts");
    expect(config).toContain("assertPlaywrightSupabaseIsolation();");
    expect(platform).toContain("isStandaloneDisplayMode()");
    expect(platform).toContain("isAppMode: isNative || isStandalone");
  });
});
