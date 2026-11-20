import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePublicDirectoryFacet } from "./v3-public-directory-search";

const wiki = readFileSync("src/routes/wiki/index.tsx", "utf8");

describe("Explore Wiki publication-refresh and navigable facet integrity", () => {
  it("only uses a successful, non-refetching country collection", () => {
    expect(wiki).toContain("countriesQuery.isSuccess && !countriesQuery.isFetching && !countriesQuery.isRefetchError");
    expect(wiki).toContain("countriesQuery.isLoading || countriesQuery.isFetching");
    expect(wiki).toContain("countriesQuery.isError || countriesQuery.isRefetchError");
    expect(wiki).toContain("useCountries()");
    expect(wiki).toContain("WikiPublicReadError");
    expect(wiki).toContain("onRetry={() => void countriesQuery.refetch()}");
    expect(wiki).toContain('kind="error"');
    expect(wiki).toContain("Retry Wiki articles");
    expect(wiki).not.toContain('from "@/integrations/supabase/client"');
  });

  it("recovers region and letter controls after a published country removal", () => {
    expect(resolvePublicDirectoryFacet("Hydra", ["Atlas"])).toBe("all");
    expect(resolvePublicDirectoryFacet("Ø", ["A", "B"])).toBe("all");
    expect(wiki).toContain("resolvePublicDirectoryFacet(region, regions)");
    expect(wiki).toContain("resolvePublicDirectoryFacet(letter, letters)");
    expect(wiki).toContain("region: effectiveRegion");
    expect(wiki).toContain('effectiveLetter === "all"');
    expect(wiki).toContain("value={effectiveRegion}");
    expect(wiki).toContain("useEffect(() => setVisibleCount(DIRECTORY_PAGE_SIZE), [search, effectiveRegion, effectiveLetter])");
  });

  it("preserves the independently verified Wiki-to-Reference redirect", () => {
    expect(wiki).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(wiki).toContain("referenceRollout.isFetching");
    expect(wiki).toContain("referenceRollout.isSuccess && !referenceRollout.isRefetchError");
    expect(wiki).toContain('<Navigate to="/encyclopedia"');
    expect(wiki).toContain("AppWikiIndexPage");
    expect(wiki).toContain("WebWikiIndexPage");
  });
});
