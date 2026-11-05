import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Solaris V3 universal directory visual foundation", () => {
  it("preserves a runtime-owned single three-experience composition", () => {
    const source = read("src/components/v3/V3DirectoryFamilyIndex.tsx");
    expect(source).toContain("useV3DirectoryPresentation()");
    expect(source).toContain("platformResolved");
    expect(source).toContain('data-directory-experience={presentation}');
    expect(source).toContain('data-directory-kind={variant}');
    expect(source).toContain("directoryCountLabel(");
    expect(source).toContain("searchMatches");
    expect(source).toContain('aria-label="Clear search"');
    expect(source).toContain("role=\"search\"");
    expect(source).toContain("v3-directory-group-count");
    expect(source).not.toContain('eyebrow="Browse"');
  });

  it("keeps Tools as an action launcher and Site Directory as a sitemap", () => {
    const tools = read("src/routes/tools/index.tsx");
    const sitemap = read("src/routes/site-directory/index.tsx");
    const css = read("src/styles/v3-directory-family.css");
    expect(tools).toContain('variant="tools"');
    expect(sitemap).toContain('variant="sitemap"');
    expect(css).toContain('[data-directory-kind="tools"]');
    expect(css).toContain('[data-directory-kind="sitemap"]');
    expect(css).toContain("v3-directory-tool-icon");
    expect(tools).toContain("PUBLIC_TOOL_GROUPS");
    expect(sitemap).toContain("siteDirectoryDestinations");
  });

  it("makes the Countries collection choice visible without changing its public data source", () => {
    const countries = read("src/components/v3/V3CountriesDiscoveryScreen.tsx");
    const css = read("src/styles/v3-countries-discovery.css");
    expect(countries).toContain("setParticipatingOnly(false)");
    expect(countries).toContain("usePublicEditionParticipants");
    expect(countries).toContain("directoryCountLabel(");
    expect(countries).toContain('aria-pressed={!participatingOnly}');
    expect(countries).toContain('aria-pressed={participatingOnly}');
    expect(countries).toContain('className={`v3-countries-scope-button');
    expect(countries).toContain("<Check size={16}");
    expect(css).toContain(".v3-countries-scope-button.is-selected");
    expect(css).toContain("background:var(--primary)");
  });

  it("retains published edition winners and compact chronological history", () => {
    const editions = read("src/routes/editions/index.tsx");
    const css = read("src/styles/v3-directory-family.css");
    expect(editions).toContain("resolveShowPublication(grandFinal)");
    expect(editions).toContain("publication?.results");
    expect(editions).toContain("directoryCountLabel(");
    expect(editions).toContain('aria-label="Clear search"');
    expect(editions).toContain('v3-editions-feature');
    expect(editions).toContain('v3-directory-group-title');
    expect(css).toContain(".v3-editions-directory .v3-editions-feature");
  });
});
