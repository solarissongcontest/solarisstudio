import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("V3 public three-experience navigation boundary", () => {
  const shell = read("src/components/v3/V3AppShell.tsx");
  const desktop = read("src/components/v3/V3DesktopPrimaryNavigation.tsx");
  const mobileWeb = read("src/components/v3/V3MobileWebPrimaryNavigation.tsx");
  const css = read("src/styles/v3-mobile-web-primary-nav.css");
  const responsive = read("src/styles/v3-responsive-shell.css");

  it("resolves runtime before mounting mutually exclusive browser or installed navigation", () => {
    expect(shell).toContain("const { isAppMode, platformResolved } = useSolarisApp()");
    expect(shell).toContain("platformResolved && !isAppMode ? (");
    expect(shell).toContain("platformResolved && isAppMode ? (");
    expect(shell).toContain('data-v3-shell-experience={!platformResolved ? "resolving" : isAppMode ? "app" : "web"}');
    expect(shell).toContain("<V3MobileWebPrimaryNavigation");
    // This migration preserves the approved V3 dock, not a second installed navigation owner.
    expect(shell).toContain("<V3LiquidTabBar");
    expect(shell).not.toContain("<AppTabBar");
  });

  it("does not let ordinary browser navigation restore an installed user's tab memory", () => {
    expect(shell).toContain(
      'if (typeof window === "undefined" || !isAppMode || !navigationIdentityReady) return;',
    );
    expect(shell).toContain("    isAppMode,");
    expect(shell).toContain("getV3PublicTabDestination");
    expect(shell).toContain("rememberV3PublicLocation");
    expect(mobileWeb).toContain("to={destination.to as any}");
    expect(mobileWeb).not.toContain("getV3PublicTabDestination");
    expect(desktop).toContain("onClick={onSelect ? (event) => {");
    expect(desktop).toContain('aria-label={onSelect ? "Primary app navigation" : "Solaris website sections"}');
    expect(desktop).toContain("resolveV3WebNavigationCurrent");
  });

  it("offers five accessible browser sections in flow, never a fixed duplicate dock", () => {
    expect(mobileWeb).toContain('aria-label="Solaris website sections"');
    expect(mobileWeb).toContain('aria-current={resolveV3WebNavigationCurrent({ active, pathname, target: destination.to })}');
    expect(mobileWeb).toContain('nav.scrollLeft += delta');
    expect(mobileWeb).toContain('window.removeEventListener("resize", keepActiveVisible)');
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(":focus-visible");
    expect(css).not.toContain("position: fixed");
    expect(css).toContain('html:not([data-solaris-app])');
    expect(css).toContain('height: max(20px, env(safe-area-inset-bottom))');
    expect(responsive).toContain("html[data-solaris-app]");
    expect(responsive).toContain(".v3-desktop-primary-nav {\n    display: none;");
  });

  it("keeps reduced motion, browser scroll-end clearance and installed landscape controls", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('@media (max-width: 1023px)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(responsive).toContain("@media (min-width: 1024px) and (max-height: 599px)");
    expect(responsive).toContain(".v3-bottom-nav.v3-liquid-tabbar {\n    display: block !important;");
  });
});
