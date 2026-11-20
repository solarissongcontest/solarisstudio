import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wiki = readFileSync("src/routes/wiki/index.tsx", "utf8");

describe("V3 Wiki: editorial presentation and public-refresh reconciliation", () => {
  it("preserves separate installed-app and ordinary-web Wiki compositions", () => {
    expect(wiki).toContain("function AppWikiIndexPage()");
    expect(wiki).toContain("function WebWikiIndexPage()");
    expect(wiki).toContain("solaris-app-directory-tools");
    expect(wiki).toContain("solaris-app-directory-list-v6");
    expect(wiki).toContain("wiki-editorial-index");
    expect(wiki).toContain("wiki-editorial-filter");
    expect(wiki).toContain("wiki-editorial-grid");
    expect(wiki).toContain("DIRECTORY_PAGE_SIZE = 18");
  });

  it("never treats a cached public country row as current publication authority", () => {
    expect(wiki.split("countriesQuery.isSuccess && !countriesQuery.isFetching && !countriesQuery.isRefetchError").length - 1).toBeGreaterThanOrEqual(2);
    expect(wiki.split("const countries = countriesQuery.isSuccess").length - 1).toBe(2);
    expect(wiki).toContain("countriesQuery.isError || countriesQuery.isRefetchError");
    expect(wiki).toContain("countriesQuery.isLoading || countriesQuery.isFetching");
    expect(wiki).toContain("WikiPublicReadError");
    expect(wiki).toContain('kind="error"');
    expect(wiki).toContain("Retry Wiki articles");
    expect(wiki).not.toContain("ArchiveDataError");
    expect(wiki).not.toContain('from "@/integrations/supabase/client"');
  });

  it("resolves revoked alphabet/region choices without a second country reader", () => {
    expect(wiki).toContain("resolvePublicDirectoryFacet(region, regions)");
    expect(wiki).toContain("resolvePublicDirectoryFacet(letter, letters)");
    expect(wiki).toContain("region: effectiveRegion");
    expect(wiki).toContain("effectiveLetter === item");
    expect(wiki).toContain("value={effectiveRegion}");
    expect(wiki).toContain("countryDirectoryRegionOptions(countries ?? []");
    expect(wiki).toContain("useCountries()");
  });

  it("only redirects to published Reference after fresh rollout verification", () => {
    expect(wiki).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(wiki).toContain('refetchOnMount: "always"');
    expect(wiki).toContain("referenceRollout.isFetching");
    expect(wiki).toContain("referenceRollout.isSuccess && !referenceRollout.isRefetchError");
    expect(wiki).toContain('<Navigate to="/encyclopedia"');
  });
});
