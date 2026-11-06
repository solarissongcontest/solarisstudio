import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 installed, mobile-web and desktop-web shell separation", () => {
  it("waits for canonical platform detection and never mounts a fixed dock for web", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    expect(shell).toContain("const { isAppMode, platformResolved } = useSolarisApp()");
    expect(shell).toContain('data-v3-shell-experience={!platformResolved ? "resolving" : isAppMode ? "app" : "web"}');
    expect(shell).toContain("platformResolved && !isAppMode ? (");
    expect(shell).toContain("platformResolved && isAppMode ? (");
    expect(shell).toContain("<V3MobileWebPrimaryNavigation");
    expect(shell).toContain("<V3LiquidTabBar");
    expect(shell).toContain("onSelect={isAppMode ? selectDestination : undefined}");
    expect(shell).not.toContain("window.innerWidth <= 390");
  });

  it("preserves app tab memory only for installed runtime, not browser visits", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    expect(shell).toContain('if (typeof window === "undefined" || !isAppMode || !navigationIdentityReady) return;');
    expect(shell).toContain("rememberV3PublicLocation(");
    expect(shell).toContain("getV3PublicTabDestination(");
    expect(shell).toContain("    isAppMode,");
    const desktop = source("src/components/v3/V3DesktopPrimaryNavigation.tsx");
    expect(desktop).toContain("onClick={onSelect ?");
    expect(desktop).toContain("onSelect?: (destination: V3LiquidTabDestination) => void");
    expect(desktop).toContain("resolveV3WebNavigationCurrent");
  });

  it("renders browser website sections as direct 44px links in document flow", () => {
    const web = source("src/components/v3/V3MobileWebPrimaryNavigation.tsx");
    const css = source("src/styles/v3-mobile-web-primary-nav.css");
    expect(web).toContain('aria-label="Solaris website sections"');
    expect(web).toContain("to={destination.to as any}");
    expect(web).toContain("aria-current={resolveV3WebNavigationCurrent");
    expect(web).not.toContain("getV3PublicTabDestination");
    expect(web).not.toContain("event.preventDefault()");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(css).not.toContain("position: fixed");
    expect(css).toContain('data-v3-shell-experience="web"');
  });
});
