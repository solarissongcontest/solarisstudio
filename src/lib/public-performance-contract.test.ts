import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const size = (path: string) => statSync(resolve(process.cwd(), path)).size;

describe("public performance contract", () => {
  it("does not mount bulk entity queries or editor controllers on every route", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    expect(visual).not.toContain("useAllShows");
    expect(visual).not.toContain("useEditions");
    expect(visual).not.toContain("useCountryThemes");
    expect(visual).toContain("countryThemeEditor ?");
    expect(visual).toContain("editionThemeEditor ?");
  });

  it("polls results only while a loaded show or edition is live", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    expect(visual).toContain("Boolean(edition && isLiveResultContext(edition.status))");
    expect(visual).toContain("Boolean(show && isLiveResultContext(show.status))");
    expect(visual).toContain("const interval = live");
  });

  it("keeps specialist visual CSS route-scoped", () => {
    const visual = source("src/components/RouteVisualTheme.tsx");
    const country = source("src/components/CountryPersonalityStyles.tsx");
    const edition = source("src/components/EditionPublicStyles.tsx");
    expect(visual).not.toContain('import "@/country-personalities.css"');
    expect(country).toContain("?inline");
    expect(edition).toContain("?inline");
  });

  it("uses appropriately sized persistent shell imagery", () => {
    const shell = source("src/components/AppShell.tsx");
    const styles = source("src/styles.css");
    expect(shell).toContain('/solaris-studio-mark.png');
    expect(styles).toContain('/solaris-background.webp');
    expect(size("public/solaris-studio-mark.png")).toBeLessThan(25_000);
    expect(size("public/solaris-background.webp")).toBeLessThan(100_000);
  });

  it("uses route-aware desktop canvases while retaining a reading measure", () => {
    const shell = source("src/components/AppShell.tsx");
    const layouts = source("src/desktop-public-layouts.css");
    expect(shell).toContain('data-public-layout={publicLayout}');
    expect(shell).toContain('max-w-[1680px]');
    expect(layouts).toContain('--public-reading-measure: 72ch');
    expect(layouts).toContain('data-public-layout="reading"');
  });
});
