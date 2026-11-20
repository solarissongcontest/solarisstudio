import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_DIRECTORY_QUERY_LENGTH,
  normalizePublicDirectoryUrlQuery,
  parseEditionDirectoryUrlSearch,
  parsePublicDirectoryUrlSearch,
} from "./v3-directory-url-search";

describe("Public Explore permalink filters", () => {
  it("restores public search and a valid category on directory routes", () => {
    expect(parsePublicDirectoryUrlSearch({ q: "  Ørnådal    jury  ", area: "results" }))
      .toEqual({ q: "Ørnådal jury", area: "results" });
    expect(parsePublicDirectoryUrlSearch({ q: "history", area: "countries-stories" }))
      .toEqual({ q: "history", area: "countries-stories" });
    expect(parsePublicDirectoryUrlSearch({ q: "  ", area: "all" }))
      .toEqual({ q: undefined, area: undefined });
  });

  it("rejects malformed facets and bounds URLs without reading protected data", () => {
    expect(parsePublicDirectoryUrlSearch({ q: ["private"], area: ["results"] }))
      .toEqual({ q: undefined, area: undefined });
    expect(parsePublicDirectoryUrlSearch({ q: "a\u0000b\n c", area: "../admin" }))
      .toEqual({ q: "a b c", area: undefined });
    expect(parsePublicDirectoryUrlSearch({ q: "x".repeat(500), area: "results" }).q)
      .toHaveLength(MAX_PUBLIC_DIRECTORY_QUERY_LENGTH);
    expect(parsePublicDirectoryUrlSearch({ area: "A".repeat(100) }).area)
      .toBeUndefined();
  });

  it("normalizes repeated spaces so a shared URL settles without navigation loops", () => {
    expect(normalizePublicDirectoryUrlQuery(" SSC    22  ")).toBe("SSC 22");
    expect(normalizePublicDirectoryUrlQuery("  ")).toBeUndefined();
  });

  it("permits oldest-first edition history but rejects unsupported URL sort values", () => {
    expect(parseEditionDirectoryUrlSearch({ q: "SSC 22", scope: "past", order: "oldest" }))
      .toEqual({ q: "SSC 22", scope: "past", order: "oldest" });
    expect(parseEditionDirectoryUrlSearch({ q: "Tetlehamn", scope: "latest" }))
      .toEqual({ q: "Tetlehamn", scope: "latest", order: undefined });
    expect(parseEditionDirectoryUrlSearch({ q: "SSC", scope: "hidden", order: "newest" }))
      .toEqual({ q: "SSC", scope: undefined, order: undefined });
  });

  it("wires validated search and category history to each public-only directory", () => {
    for (const route of ["tools", "archive", "site-directory"]) {
      const source = readFileSync(`src/routes/${route}/index.tsx`, "utf8");
      expect(source).toContain("validateSearch: parsePublicDirectoryUrlSearch");
      expect(source).toContain("urlSearch={urlSearch}");
      expect(source).toContain("onUrlSearchChange=");
      expect(source).not.toContain("from \"@/integrations/supabase/client\"");
    }

    const family = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
    expect(family).toContain("resolveDirectoryScope(area, groups)");
    expect(family).toContain("group.items.filter(item => allows(item.to))");
    expect(family).toContain("urlSearch?.q");
    expect(family).toContain("window.setTimeout");
    // Navigation owns URL replacement; the shared view owns debounce.
    expect(family).toContain("window.setTimeout");
    for (const route of ["tools", "archive", "site-directory"]) {
      expect(readFileSync(`src/routes/${route}/index.tsx`, "utf8"))
        .toContain("replace: true");
    }
  });

  it("restores and persists Edition filters while retaining published-only winner reads", () => {
    const editions = readFileSync("src/routes/editions/index.tsx", "utf8");
    expect(editions).toContain("validateSearch: parseEditionDirectoryUrlSearch");
    expect(editions).toContain("Route.useSearch()");
    expect(editions).toContain("Route.useNavigate()");
    expect(editions).toContain("replace: true");
    expect(editions).toContain("orderedPast.map((card)");
    expect(editions).toContain('aria-label="Sort past editions"');
    expect(editions).toContain("matchesPublicDirectorySearch(normalizedSearch");
    expect(editions).toContain("usePublicFinalWinners(publishedFinalShowIds)");
    expect(editions).not.toContain("useAllResults");
  });
});
