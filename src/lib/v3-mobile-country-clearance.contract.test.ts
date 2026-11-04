import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 country browsing and bottom navigation clearance", () => {
  it("uses one browse surface rather than an arbitrary set of featured country cards", () => {
    const countries = source("src/components/v3/V3CountriesDiscoveryScreen.tsx");
    expect(countries).not.toContain("discovery.participating.slice(0, 9)");
    expect(countries).not.toContain("<AppGroupedList>");
    expect(countries).toContain('aria-label="Country collections"');
    expect(countries).toContain('aria-pressed={participatingOnly}');
    expect(countries).toContain('aria-pressed={!participatingOnly}');
    expect(countries).toContain("<CountryTile key={country.id} country={country} />");
    expect(countries).toContain('className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"');
    expect(countries).toContain("setVisibleCount((count) => count + BROWSE_PAGE_SIZE)");
    expect(countries).toContain("participatingOnly && activeEdition ? filtered : filtered.slice(0, visibleCount)");
  });

  it("keeps the final content scrollable above the iOS floating bar while metrics settle", () => {
    const shell = source("src/components/AppShell.tsx");
    const styles = source("src/styles/app-shell.css");
    const navbar = source("src/components/app/AppTabBar.tsx");

    expect(shell).toContain('data-solaris-app-bottom-spacer=""');
    expect(shell).not.toContain('import "@/styles/v3-mobile-bottom-clearance.css"');
    expect(styles).toContain('@media (max-width: 899px)');
    expect(styles).toContain('> .solaris-app-bottom-spacer');
    expect(styles).toContain('var(--solaris-app-bottom-obstruction, 0px) + 1.25rem');
    expect(styles).toContain('var(--solaris-app-tabbar-height, 4.7rem)');
    expect(styles).toContain('max(2.75rem, env(safe-area-inset-bottom))');
    expect(styles).toContain('[data-solaris-keyboard-open]');
    expect(styles).toContain('height: 1.25rem;');
    expect(styles).toContain(".solaris-app-bottom-spacer");
    expect(styles).toContain("flex: 0 0 auto");
    expect(navbar).toContain('root.style.setProperty("--solaris-app-bottom-obstruction"');
  });
});
