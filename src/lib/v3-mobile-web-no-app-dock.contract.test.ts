import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ordinary mobile web has its own navigation, not an installed-app dock", () => {
  it("retains public header/drawer and footer with no fixed five-tab browser bar", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain('className="site-nav sticky top-0');
    expect(shell).toContain('aria-label="Open navigation"');
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<PublicMobileSectionNav");
    expect(shell).toContain("<PublicFooter");
    expect(shell).not.toContain("mobile-quick-nav");
    expect(shell).not.toContain("quickNavigation.map");
  });

  it("retains the real installed-PWA navigation and safe-area authority", () => {
    const shell = read("src/components/AppShell.tsx");
    const css = read("src/styles/app-shell.css");
    expect(shell).toContain("<AppToolbar");
    expect(shell).toContain("<AppTabBar");
    expect(shell).toContain('data-solaris-app-bottom-spacer=""');
    expect(shell).toContain('isAppMode && appChrome.tabBar !== "hidden"');
    expect(css).toContain(".solaris-app-tabbar");
  });

  it("uses normal website footer spacing without reserving dock clearance", () => {
    const css = read("src/card-typography.css");
    const base = read("src/styles.css");
    expect(css).toContain("html:not([data-solaris-app]) .app-main");
    expect(css).toContain("max(2rem, calc(1rem + env(safe-area-inset-bottom)))");
    expect(base).toContain("max(2rem, calc(1rem + env(safe-area-inset-bottom)))");
    expect(css).not.toContain("calc(6.5rem + env(safe-area-inset-bottom))");
  });
});
