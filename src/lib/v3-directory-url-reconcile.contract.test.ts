import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveDirectoryScope } from "./v3-directory-count";
import { matchesPublicDirectorySearch } from "./v3-public-directory-search";
import {
  MAX_PUBLIC_DIRECTORY_QUERY_LENGTH,
  normalizePublicDirectoryUrlQuery,
  parsePublicDirectoryUrlSearch,
} from "./v3-directory-url-search";

describe("V3 public Explore permalink reconciliation", () => {
  it("restores normalized, bounded search terms and validated category IDs", () => {
    expect(parsePublicDirectoryUrlSearch({ q: "  Ørnådal    jury ", area: "results" }))
      .toEqual({ q: "Ørnådal jury", area: "results" });
    expect(normalizePublicDirectoryUrlQuery("  SSC   22  ")).toBe("SSC 22");
    expect(parsePublicDirectoryUrlSearch({ q: "x".repeat(500), area: "../admin" }))
      .toEqual({ q: "x".repeat(MAX_PUBLIC_DIRECTORY_QUERY_LENGTH), area: undefined });
    expect(parsePublicDirectoryUrlSearch({ q: ["private"], area: ["results"] }))
      .toEqual({ q: undefined, area: undefined });
    expect(parsePublicDirectoryUrlSearch({ q: " ", area: "all" }))
      .toEqual({ q: undefined, area: undefined });
  });

  it("keeps search purely presentational and recovers from a removed category", () => {
    expect(matchesPublicDirectorySearch("ornadal records", ["Ørnådal", "official records"])).toBe(true);
    expect(matchesPublicDirectorySearch("confidential", ["Published history"])).toBe(false);
    expect(resolveDirectoryScope("results", [{ id: "history" }, { id: "results" }])).toBe("results");
    expect(resolveDirectoryScope("results", [{ id: "history" }])).toBe("all");
    expect(resolveDirectoryScope("results", [])).toBe("all");
  });

  it("connects validated URL state across Tools, Site Directory and Archive", () => {
    for (const name of ["tools", "site-directory", "archive"]) {
      const source = readFileSync(`src/routes/${name}/index.tsx`, "utf8");
      expect(source).toContain("validateSearch: parsePublicDirectoryUrlSearch");
      expect(source).toContain("Route.useSearch()");
      expect(source).toContain("Route.useNavigate()");
      expect(source).toContain("urlSearch={urlSearch}");
      expect(source).toContain("onUrlSearchChange=");
      expect(source).toContain("replace: true");
      expect(source).not.toContain('from "@/integrations/supabase/client"');
    }

    const family = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
    expect(family).toContain("group.items.filter(item => allows(item.to))");
    expect(family).toContain("resolveDirectoryScope(area, groups)");
    expect(family).toContain("normalizePublicDirectoryUrlQuery(search)");
    expect(family).toContain("window.setTimeout");
    expect(family).toContain("window.clearTimeout");
    expect(family).toContain("Clear filters");
    expect(family).toContain("v3-editorial-directory");
    expect(family).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    const archive = readFileSync("src/routes/archive/index.tsx", "utf8");
    expect(archive).toContain('visualClassName="v3-editorial-archive"');
    expect(archive).toContain("Published history from its original editions.");
  });
});
