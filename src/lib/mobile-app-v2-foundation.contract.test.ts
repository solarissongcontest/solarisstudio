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
    expect(css).toContain("--solaris-app-tabbar-max-height: 5.35rem");
    expect(css).toContain("max-height: var(--solaris-app-tabbar-max-height)");
    expect(css).not.toContain("solaris-kube-safari-mirror");
    expect(sw).toContain('const CACHE_VERSION = "solaris-app-v14"');
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
    expect(sheet).toContain("z-[var(--solaris-z-sheet-backdrop)]");
    expect(sheet).toContain("size-11");
  });

  it("keeps canonical flags clipped with an optical default radius", () => {
    const media = source("src/components/FlagMedia.tsx");
    const css = source("src/flag-media.css");
    expect(media).toContain('data-flag-frame="standard"');
    expect(css).toContain("overflow: hidden");
  });

  it("detects all installed display modes requested by the manifest", () => {
    const platform = source("src/lib/platform.ts");
    const runtime = source("src/components/app/AppRuntime.tsx");
    const manifest = source("public/site.webmanifest");

    expect(manifest).toContain("window-controls-overlay");
    expect(platform).toContain("(display-mode: window-controls-overlay)");
    expect(runtime).toContain("(display-mode: window-controls-overlay)");
  });

  it("does not expose push deployment internals to users", () => {
    const notifications = source("src/lib/app-notifications.ts");
    const panel = source("src/components/mysolaris/MySolarisNotificationsPanel.tsx");

    expect(notifications).not.toContain("Solaris push delivery is not configured on this deployment yet");
    expect(notifications).toContain("Push notifications are temporarily unavailable.");
    expect(panel).toContain("pushState.configured");
  });

  it("uses app-specific compositions for major browsing roots", () => {
    const explore = source("src/routes/explore/index.tsx");
    const results = source("src/routes/results/index.tsx");
    const directory = source("src/routes/site-directory/index.tsx");
    const editions = source("src/routes/editions/index.tsx");
    const countries = source("src/routes/countries/index.tsx");
    const shows = source("src/routes/shows/index.tsx");
    const wiki = source("src/routes/wiki/index.tsx");

    expect(explore).toContain("solaris-app-grouped-list");
    expect(results).toContain("solaris-app-result-hero");
    expect(directory).toContain("solaris-app-list-row");
    expect(editions).toContain("solaris-app-editions-v5");
    expect(editions).toContain("solaris-app-flat-row");
    expect(countries).toContain("AppCountriesPage");
    expect(countries).toContain("solaris-app-country-row");
    expect(shows).toContain("AppShowsPage");
    expect(wiki).toContain("AppWikiIndexPage");
  });

  it("uses the redesigned installed browsing hierarchy for Wiki, Editions and Shows", () => {
    const wiki = source("src/routes/wiki/index.tsx");
    const countries = source("src/routes/countries/index.tsx");
    const editions = source("src/routes/editions/index.tsx");
    const shows = source("src/routes/shows/index.tsx");
    const styles = source("src/styles/app-shell.css");

    const search = source("src/components/app/SolarisSearchField.tsx");

    expect(wiki).toContain("<SolarisSearchField");
    expect(wiki).toContain("solaris-app-filter-sheet");
    expect(countries).toContain("<SolarisSearchField");
    expect(countries).toContain("solaris-app-filter-sheet");
    expect(search).toContain("data-solaris-search-field");
    expect(search).toContain('type="text"');
    expect(search).toContain('inputMode="search"');
    expect(editions).toContain("solaris-app-featured-row");
    expect(editions).toContain('data-solaris-flat-list="editions"');
    expect(shows).toContain("solaris-app-shows-v6");
    expect(shows).toContain("data-solaris-show-list");
    expect(shows).toContain("appShowMeta(show)");
    expect(styles).toContain("Mobile Visual System V6");
  });

  it("forces installed search to one visual surface and flags to canonical rounded 3:2 frames", () => {
    const search = source("src/components/app/SolarisSearchField.tsx");
    const flags = source("src/components/FlagChip.tsx");
    const styles = source("src/styles/app-shell.css");
    const surfaces = source("src/solaris-surfaces.css");
    const globalStyles = source("src/styles.css");
    const unified = source("src/unified-design.css");
    const calmChrome = source("src/calm-public-chrome.css");

    expect(search).toContain("solaris-app-search-shell");
    expect(search).toContain("solaris-app-search-input");
    expect(styles).toContain("all: unset !important");
    expect(styles).toContain("overflow: hidden");
    expect(styles).toContain("background: rgb(255 255 255 / .055)")
    expect(flags).toContain("--solaris-flag-radius");
    expect(styles).toContain("aspect-ratio: 3 / 2 !important");
    expect(styles).toContain("border-radius: var(--solaris-flag-radius, .55rem) !important");
    expect(surfaces).toContain(":not(.solaris-app-search-input)");
    expect(globalStyles).toContain("input:not(.solaris-app-search-input)");
    expect(unified).toContain("input:not(.solaris-app-search-input)");
    expect(calmChrome).toContain("input:not(.solaris-app-search-input)");
  });

  it("prevents website chrome from flashing before installed-app hydration", () => {
    const root = source("src/routes/__root.tsx");
    const runtime = source("src/components/app/AppRuntime.tsx");
    const css = source("src/styles/app-shell.css");

    expect(root).toContain("data-solaris-app-boot");
    expect(root).toContain('navigator.standalone === true');
    expect(runtime).toContain('removeAttribute("data-solaris-app-boot")');
    expect(css).toContain('html[data-solaris-app-boot] body::before');
  });

  it("lets app toolbar identity replace repeated PageHeader titles without losing actions", () => {
    const shell = source("src/components/AppShell.tsx");
    expect(shell).toContain("toolbarOwnsIdentity");
    expect(shell).toContain("solaris-app-page-context");
    expect(shell).toContain("{actions ? (");
  });

  it("keeps installed-app search off the full archive query fan-out", () => {
    const search = source("src/components/public/PublicCommandPalette.tsx");
    const migration = source("supabase/migrations/20261002153000_public_app_search.sql");

    expect(search).toContain("AppPublicPaletteDialog");
    expect(search).toContain('rpc("solaris_public_search"');
    expect(search).toContain("if (props.appMode)");
    expect(migration).toContain("create or replace function public.solaris_public_search");
  });
});
