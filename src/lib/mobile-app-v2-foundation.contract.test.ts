import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Mobile App V2 architectural invariants", () => {
  it("keeps route chrome as the single source of active tab truth", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const toolbar = source("src/components/app/AppToolbar.tsx");

    expect(tabs).toContain("resolveAppRouteChrome(pathname, searchStr)");
    expect(tabs).not.toContain("publicAreaForPath");
    expect(toolbar).toContain("resolveAppRouteChrome(pathname, searchStr)");
    expect(toolbar).toContain("historyChrome?.tab === chrome.tab");
  });

  it("keeps route loading and error states on the canonical AppShell", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");

    expect(frame).toContain("<AppShell>");
    expect(frame).not.toContain("<AppTabBar");
    expect(frame).not.toContain("solaris-app-toolbar");
    expect(frame).not.toContain("signedIn={false}");
  });

  it("uses measured app chrome obstruction instead of another guessed runway", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const css = source("src/styles/app-shell.css");

    expect(tabs).toContain("ResizeObserver");
    expect(tabs).toContain("--solaris-app-bottom-obstruction");
    expect(css).toContain("var(--solaris-app-bottom-obstruction");
    expect(css).toContain('data-solaris-app-tabbar="hidden"');
  });

  it("keeps installed tabbar geometry bounded without Safari DOM mirroring", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const glass = source("src/components/app/KubeLiquidGlassBackdrop.tsx");
    const css = source("src/styles/app-shell.css");
    const v3NavbarCss = source("src/styles/v3-installed-app-navbar.css");
    const sw = source("public/sw.js");
    const flags = source("src/components/FlagChip.tsx");
    const flagCss = source("src/flag-media.css");

    expect(tabs).toContain("Math.min(rawObstruction, 128)");
    expect(tabs).not.toContain('setProperty("--solaris-app-tabbar-height"');
    expect(tabs).toContain('window.addEventListener("orientationchange"');
    expect(tabs).toContain('document.addEventListener("visibilitychange"');
    expect(tabs).toContain("onLostPointerCapture={cancelDrag}");
    expect(glass).not.toContain("cloneNode(true)");
    expect(glass).not.toContain("MutationObserver");
    expect(glass).toContain('"css-backdrop"');
    expect(css).toContain("--solaris-app-tabbar-max-height: 4.6rem");
    expect(css).toContain("max-height: var(--solaris-app-tabbar-max-height)");
    expect(v3NavbarCss).toContain("max-height: 64px");
    expect(v3NavbarCss).toContain("height: 64px");
    expect(v3NavbarCss).toContain("min-height: 44px");
    expect(v3NavbarCss).toContain("width: min(");
    expect(css).not.toContain("solaris-kube-safari-mirror");
    expect(v3NavbarCss).not.toContain("solaris-kube-safari-mirror");
    expect(sw).toContain('const CACHE_VERSION = "solaris-app-v15"');
    expect(flags).toContain('size === "lg" || size === "xl"');
    expect(flagCss).not.toContain(
      "flex-shrink: 0;\n  border-radius: inherit;\n  isolation: isolate;",
    );
  });

  it("implements visible, minimal and hidden tab bar modes", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    expect(tabs).toContain('tabbarMode === "hidden"');
    expect(tabs).toContain('tabbarMode === "minimal"');
    expect(tabs).toContain("is-minimal");
  });

  it("does not stack a second MySolaris phone navigation inside the app", () => {
    const nav = source("src/components/mysolaris/MySolarisWorkspaceNav.tsx");
    expect(nav).toContain("useSolarisApp");
    expect(nav).toContain("!isAppMode ? <section");
    expect(nav).toContain("data-mysolaris-mobile-nav");
  });

  it("uses actual sheets for first run and Wiki app tools", () => {
    const firstRun = source("src/components/app/AppFirstRun.tsx");
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");
    const sheet = source("src/components/ui/sheet.tsx");

    expect(firstRun).toContain("<Sheet");
    expect(firstRun).not.toContain("<Dialog");
    expect(wiki).toContain("<SheetContent");
    expect(sheet).toContain("z-[var(--solaris-z-sheet)]");
    expect(sheet).toContain("size-11");
  });

  it("keeps canonical flags clipped with an optical default radius", () => {
    const media = source("src/components/FlagMedia.tsx");
    const chip = source("src/components/FlagChip.tsx");
    const css = source("src/flag-media.css");

    expect(media).toContain('radius = "var(--flag-radius)"');
    expect(media).toContain("overflow: 'hidden'");
    expect(media).toContain("aspectRatio: FLAG_ASPECT_RATIO");
    expect(chip).toContain('className="flag-media"');
    expect(css).toContain("border-radius: var(--flag-radius)");
  });

  it("detects all installed display modes requested by the manifest", () => {
    const appMode = source("src/hooks/use-app-mode.ts");
    expect(appMode).toContain("(display-mode: standalone)");
    expect(appMode).toContain("(display-mode: window-controls-overlay)");
    expect(appMode).toContain("navigator.standalone === true");
  });

  it("does not expose push deployment internals to users", () => {
    const settings = source("src/components/app/AppSettingsScreen.tsx");
    expect(settings).not.toContain("VAPID");
    expect(settings).not.toContain("Solaris push delivery is not configured on this deployment yet");
  });

  it("uses app-specific compositions for major browsing roots", () => {
    const routes = [
      "src/routes/app/index.tsx",
      "src/routes/app/explore.tsx",
      "src/routes/app/participate.tsx",
      "src/routes/app/results.tsx",
      "src/routes/app/me.tsx",
    ];
    for (const route of routes) {
      expect(source(route)).toContain("AppShell");
    }
  });

  it("uses the redesigned installed browsing hierarchy for Wiki, Editions and V3 discovery roots", () => {
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");
    const editions = source("src/routes/editions/index.tsx");
    const directory = source("src/routes/site-directory/index.tsx");

    expect(wiki).toContain("solaris-app-section-heading");
    expect(editions).toContain("AppSectionHeading");
    expect(directory).toContain("AppSectionHeading");
  });

  it("forces installed search to one visual surface and flags to canonical rounded 3:2 frames", () => {
    const commandPalette = source("src/components/command/CommandPalette.tsx");
    const css = source("src/styles/app-shell.css");
    const flagCss = source("src/flag-media.css");

    expect(commandPalette).toContain("solaris-app-search-dialog");
    expect(css).toContain(".solaris-app-search-dialog");
    expect(flagCss).toContain("aspect-ratio: 3 / 2");
  });

  it("prevents website chrome from flashing before installed-app hydration", () => {
    const appMode = source("src/hooks/use-app-mode.ts");
    const css = source("src/styles/app-shell.css");

    expect(appMode).toContain("data-solaris-app-boot");
    expect(css).toContain("html[data-solaris-app-boot] body::before");
  });

  it("lets app toolbar identity replace repeated PageHeader titles without losing actions", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");
    expect(frame).toContain("AppToolbar");
    expect(frame).not.toContain("PageHeader");
  });

  it("keeps installed-app search off the full archive query fan-out", () => {
    const search = source("src/components/command/CommandPalette.tsx");
    expect(search).toContain("archiveSearchEnabled");
    expect(search).toContain("!isAppMode");
  });
});
