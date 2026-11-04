import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 three-experience shell navigation cutover", () => {
  const shell = read("src/components/v3/V3AppShell.tsx");
  const sections = read("src/components/v3/V3MobileWebPrimaryNavigation.tsx");
  const css = read("src/styles/v3-mobile-web-primary-nav.css");
  const desktopCss = read("src/styles/v3-responsive-shell.css");

  it("never mounts a floating app dock on ordinary web or unresolved platform", () => {
    expect(shell).toContain("const { isAppMode, platformResolved } = useSolarisApp()");
    expect(shell).toContain('data-v3-shell-experience={!platformResolved ? "resolving" : isAppMode ? "app" : "web"}');
    expect(shell).toContain("platformResolved && !isAppMode ? (");
    expect(shell).toContain("platformResolved && isAppMode ? (");
    expect(shell).toContain("<AppTabBar");
    expect(shell).toContain("<V3MobileWebPrimaryNavigation");
    expect(shell).not.toContain("<V3LiquidTabBar");
    expect(shell).toContain('import "@/styles/v3-liquid-tabbar.css"');
    expect(shell).toContain('import "@/styles/v3-navigation-fixed-geometry.css"');
  });

  it("provides semantic public website destinations without reusing saved app route memory", () => {
    expect(shell).toContain("destinations={V3_SHELL_DESTINATIONS}");
    expect(sections).toContain('aria-label="Solaris website sections"');
    expect(sections).toContain("to={destination.to as any}");
    expect(sections).toContain('aria-current={active ? "page" : undefined}');
    expect(sections).toContain("activeArea: V3Area | null;");
    expect(sections).toContain("const active = activeArea === destination.id;");
    expect(sections).not.toContain("event.preventDefault");
    expect(sections).not.toContain("getV3PublicTabDestination");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(css).not.toContain("position: fixed");
    const desktop = read("src/components/v3/V3DesktopPrimaryNavigation.tsx");
    expect(desktop).toContain("to={destination.to as any}");
    expect(desktop).toContain("event.metaKey");
    expect(desktop).toContain("event.ctrlKey");
    expect(desktop).toContain("event.shiftKey");
    expect(desktop).toContain("event.altKey");
    expect(desktop).toContain("event.preventDefault");
    expect(desktop).toContain("onSelect(destination)");
  });

  it("keeps desktop browser navigation distinct and mobile web content in flow", () => {
    expect(shell).toContain("<V3DesktopPrimaryNavigation");
    // Keep canonical viewer-scoped N10 tab memory until the replacement
    // authority has been formally cut over.
    expect(shell).toContain("getV3PublicTabDestination");
    expect(shell).toContain("markV3PublicNavigationRestore");
    expect(desktopCss).toContain("@media (min-width: 1024px)");
    expect(css).toContain('[data-v3-shell-experience="web"] .v3-screen');
    expect(css).toContain("@media (max-width: 1023px)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
  it("selects browser runtime in a single init script without racing installed detection", () => {
    const fixture = read("e2e/v3-navigation/navbar-local-rollout.ts");
    const probe = read("e2e/v3-navigation/browser-experience-installed-app.e2e.ts");
    expect(fixture).toContain('experience = "installed"');
    expect(fixture).toContain('standalone: experience === "installed"');
    expect(fixture).toContain('value: standalone');
    expect(fixture).toContain('matches: standalone');
    expect(probe).toContain('experience: "web"');
    expect(probe).not.toContain("context.addInitScript(");
    expect(probe).toContain("await prepareNavbarInstalledContext(context, {");
  });

});
