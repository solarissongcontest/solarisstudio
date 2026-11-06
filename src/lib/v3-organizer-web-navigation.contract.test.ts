import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Organizer V3 website and installed navigation families", () => {
  it("selects the browser or installed rail from canonical platform resolution, never viewport width", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(shell).toContain("const { isAppMode, platformResolved } = useSolarisApp()");
    expect(shell).toContain('data-organizer-runtime={!platformResolved ? "resolving" : isAppMode ? "app" : "web"}');
    expect(shell).toContain("organizerV3Enabled && platformResolved && !isAppMode");
    expect(shell).toContain("<OrganizerV3WebNavigation pathname={pathname} />");
    expect(shell).toContain("platformResolved && isAppMode ? <OrganizerV3MobileChrome />");
    expect(shell).toContain("const organizerModeResolved =");
    expect(shell).toContain("!organizerV3.isLoading && !organizerV3.isError && organizerV3.data != null");
    expect(shell).toContain("{organizerModeResolved");
    expect(shell).toContain("<OrganizerV6MobileChrome />");
    expect(shell).toContain("Organizer navigation could not be verified.");
    expect(shell).toContain("onClick={() => void organizerV3.refetch()}");
    expect(shell).not.toContain("window.innerWidth < 900");
  });

  it("links to the same five Organizer roots as the app without reading installed tab memory", () => {
    const website = source("src/components/admin/OrganizerV3WebNavigation.tsx");
    expect(website).toContain("V3_ORGANIZER_TAB_ORDER.map");
    expect(website).toContain("v3OrganizerTabRoot(tab)");
    expect(website).toContain('aria-label="Organizer website sections"');
    expect(website).toContain('normalize(pathname) === normalize(target) ? "page" : "location"');
    expect(website).toContain("to={target as any}");
    expect(website).not.toContain("getV3OrganizerTabDestination");
    expect(website).not.toContain("onClick={");
  });

  it("lets tablet/desktop browsers use the existing sidebar and restores web scroll clearance", () => {
    const css = source("src/styles/v3-organizer-web-navigation.css");
    const desktop = source("src/admin-desktop.css");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("@media (min-width: 720px)");
    expect(css).toContain("display: none !important");
    expect(css).not.toContain("position: fixed");
    expect(desktop).toContain("@media (min-width: 720px)");
    expect(desktop).toContain(".admin-sidebar");
    expect(css).toContain('data-organizer-runtime="web"] .admin-main');
  });
});
