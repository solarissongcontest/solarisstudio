import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { matchesPublicDirectorySearch } from "./v3-public-directory-search";
import { parseEditionDirectoryUrlSearch } from "./v3-directory-url-search";

describe("V3 Editions bookmarkable search with cinematic history", () => {
  it("restores supported scope and past chronology, rejects unsupported values", () => {
    expect(parseEditionDirectoryUrlSearch({
      q: "  SSC   22 ", scope: "past", order: "oldest",
    })).toEqual({ q: "SSC 22", scope: "past", order: "oldest" });
    expect(parseEditionDirectoryUrlSearch({
      q: ["secret"], scope: "draft", order: "future",
    })).toEqual({ q: undefined, scope: undefined, order: undefined });
    expect(parseEditionDirectoryUrlSearch({
      q: "  Ålanti  ", scope: "latest",
    })).toEqual({ q: "Ålanti", scope: "latest", order: undefined });
  });

  it("matches terms across already-public edition, host and winner labels", () => {
    expect(matchesPublicDirectorySearch("22 alanti", ["SSC 22", "Ålanti", "Tetlehamn"])).toBe(true);
    expect(matchesPublicDirectorySearch("22 unpublished", ["SSC 22", "Tetlehamn"])).toBe(false);
  });

  it("keeps #2602's cinematic timeline, existing winner reader and three experiences", () => {
    const source = readFileSync("src/routes/editions/index.tsx", "utf8");
    expect(source).toContain("validateSearch: parseEditionDirectoryUrlSearch");
    expect(source).toContain("Route.useSearch()");
    expect(source).toContain("Route.useNavigate()");
    expect(source).toContain("replace: true");
    expect(source).toContain("normalizePublicDirectoryUrlQuery(search)");
    expect(source).toContain("matchesPublicDirectorySearch(normalizedSearch");
    expect(source).toContain('aria-label="Sort past editions"');
    expect(source).toContain("const orderedPast = order === \"oldest\"");
    expect(source).toContain("orderedPast.map((card)");
    expect(source).toContain("v3-editions-timeline");
    expect(source).toContain('import "@/styles/v3-editions-editorial.css"');
    expect(source).toContain("useAllResults({ enabled: resultsEnabled })");
    expect(source).toContain("resolveShowPublication(grandFinal)");
    expect(source).toContain("AppGroupedList");
    expect(source).toContain("v3-directory-mobile-list");
    expect(source).toContain("v3-directory-desktop-grid");
    expect(source).not.toContain('from "@/integrations/supabase/client"');
    // Publication and result-query reownership is explicitly a separate integration.
    expect(source).not.toContain("usePublicFinalWinners(");
  });
});
