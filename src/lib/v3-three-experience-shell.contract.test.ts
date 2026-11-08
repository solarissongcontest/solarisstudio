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
    expect(shell).toContain('ariaLabel="Primary app navigation"');
    const installed = read("src/components/app/AppTabBar.tsx");
    expect(installed).toContain('ariaLabel = "Solaris Studio"');
    expect(installed).toContain("aria-label={ariaLabel}");
    expect(shell).toContain("<V3MobileWebPrimaryNavigation");
    expect(shell).not.toContain("<V3LiquidTabBar");
    expect(shell).toContain('import "@/styles/v3-liquid-tabbar.css"');
    expect(shell).toContain('import "@/styles/v3-navigation-fixed-geometry.css"');
  });

  it("provides semantic public website destinations without reusing saved app route memory", () => {
    expect(shell).toContain("destinations={V3_SHELL_DESTINATIONS}");
    expect(sections).toContain('aria-label="Solaris website sections"');
    expect(sections).toContain("to={destination.to as any}");
    expect(sections).toContain('aria-current={resolveV3WebNavigationCurrent({ active, pathname, target: destination.to })}');
    expect(sections).toContain("activeArea: V3Area | null;");
    expect(sections).toContain("const active = activeArea === destination.id;");
    expect(sections).not.toContain("event.preventDefault");
    expect(sections).not.toContain("getV3PublicTabDestination");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-width: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(sections).toContain('const navRef = useRef<HTMLElement | null>(null);');
    expect(sections).toContain('nav.querySelector<HTMLElement>(\'[aria-current]\')');
    expect(sections).toContain("nav.scrollLeft += delta");
    expect(sections).toContain('window.addEventListener("resize", keepActiveVisible)');
    expect(sections).toContain('window.removeEventListener("resize", keepActiveVisible)');
    expect(css).not.toContain("position: fixed");
    const desktop = read("src/components/v3/V3DesktopPrimaryNavigation.tsx");
    expect(desktop).toContain('aria-label="Solaris website sections"');
    expect(desktop).not.toContain('aria-label="Primary app navigation"');
    expect(desktop).toContain("to={destination.to as any}");
    // Website links must navigate their declared canonical roots. The
    // installed dock alone owns viewer-scoped tab memory and press gestures.
    expect(desktop).not.toContain("onClick={");
    expect(desktop).not.toContain("onSelect(destination)");
    expect(desktop).not.toContain("event.preventDefault()");
    expect(shell).not.toContain("onSelect={selectDestination}");
    expect(shell).toContain("onSelectV3Tab={(id) => {");
    expect(shell).toContain("getV3PublicTabDestination");
  });

  it("never persists ordinary website visits into installed viewer-scoped tab memory", () => {
    expect(shell).toContain(
      'if (typeof window === "undefined" || !isAppMode || !navigationIdentityReady) return;',
    );
    expect(shell).toContain("    isAppMode,");
    expect(shell).toContain("rememberV3PublicLocation(");
    expect(shell).toContain("updateV3PublicScrollPosition(");
    expect(shell).toContain("markV3PublicNavigationRestore(");
  });

  it("removes installed-only scroll-end reserve on mobile web without weakening the installed safe zone", () => {
    const appGeometry = read("src/styles/v3-navigation-fixed-geometry.css");
    expect(css).toContain('html:not([data-solaris-app]) [data-solaris-v3]');
    expect(css).toContain('[data-v3-shell-experience="web"] [data-v3-legacy-route-adapter]');
    expect(css).toContain('> .v3-legacy-route-bottom-clearance');
    expect(css).toContain("height: max(20px, env(safe-area-inset-bottom))");
    // A rotated tablet browser or a short desktop window can exceed 1023px.
    // The website-only spacer removal must not be trapped in the mobile query.
    const mobileQueryStart = css.indexOf("@media (max-width: 1023px)");
    const mobileQueryEnd = css.indexOf("\n}\n", mobileQueryStart);
    const webSpacerRule = css.indexOf("html:not([data-solaris-app]) [data-solaris-v3]");
    expect(mobileQueryStart).toBeGreaterThanOrEqual(0);
    expect(mobileQueryEnd).toBeGreaterThan(mobileQueryStart);
    expect(webSpacerRule).toBeGreaterThan(mobileQueryEnd);
    expect(appGeometry).toContain("calc(106px + env(safe-area-inset-bottom))");
    expect(appGeometry).toContain("calc(var(--v3-bottom-obstruction, 0px) + 24px)");
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

  it("checks Countries scroll-end clearance against the actual installed dock owner", () => {
    const account = read("e2e/account-states.e2e.ts");
    const countries = account.slice(account.indexOf("const dockClearance = await page.evaluate"));
    expect(countries).toContain(".solaris-app-tabbar[data-layout='bar']");
    expect(countries).toContain("[data-v3-legacy-bottom-clearance]");
    expect(countries).toContain("expect(dockClearance!.gap).toBeGreaterThanOrEqual(12)");
    expect(countries).not.toContain('querySelector<HTMLElement>("[data-v3-liquid-tabbar]")');
  });

});
