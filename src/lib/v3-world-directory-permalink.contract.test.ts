import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WORLD_DIRECTORY_MAX_PAGE_INDEX,
  cleanWorldSearch,
  parseWorldDirectoryUrlPage,
} from "./terra-world-public";

const route = readFileSync("src/routes/world/organizations/index.tsx", "utf8");
const screen = readFileSync("src/components/world/WorldPublic.tsx", "utf8");

describe("V3 World public directory permalink and publication-safe revalidation", () => {
  it("limits page queries to the reader's bounded, one-based page range", () => {
    for (const bad of [undefined, null, 0, -1, 1.3, "0", "01", "1.5", "1e3", "2147483647", [], {}]) {
      expect(parseWorldDirectoryUrlPage(bad)).toBe(1);
    }
    expect(parseWorldDirectoryUrlPage(1)).toBe(1);
    expect(parseWorldDirectoryUrlPage("25")).toBe(25);
    expect(parseWorldDirectoryUrlPage(WORLD_DIRECTORY_MAX_PAGE_INDEX + 1))
      .toBe(WORLD_DIRECTORY_MAX_PAGE_INDEX + 1);
    expect(parseWorldDirectoryUrlPage(WORLD_DIRECTORY_MAX_PAGE_INDEX + 2)).toBe(1);
  });

  it("normalizes directory search inputs without constructing filter syntax", () => {
    expect(cleanWorldSearch("  GUARD),status.eq.private%  ")).toBe("GUARDstatuseqprivate");
    expect(cleanWorldSearch("x".repeat(120))).toHaveLength(64);
    expect(route).toContain("validateSearch:");
    expect(route).toContain("cleanWorldSearch(search.q)");
    expect(route).toContain('search.status === "current" || search.status === "historical"');
    expect(route).toContain("parseWorldDirectoryUrlPage(search.page)");
    expect(route).toContain("q?: string");
  });

  it("preserves three presentation editorial classes with a single existing World query", () => {
    expect(screen).toContain('className="world-editorial-directory-header mt-5 max-w-3xl"');
    expect(screen).toContain("world-editorial-directory-tools");
    expect(screen).toContain("world-editorial-landing");
    expect(screen).toContain("queryFn: () => fetchWorldDirectory({ term, filter, page })");
    expect(screen).toContain("directory.isFetchedAfterMount");
    expect(screen).toContain("!directory.isRefetchError");
    expect(screen).toContain("refetchOnMount: \"always\"");
    expect(screen).toContain("verifiedDirectory.organizations");
    expect(screen).not.toContain("supabaseAdmin");
  });

  it("restores search, category and pagination while keeping the canonical publication gate", () => {
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(route).toContain("term={q}");
    expect(route).toContain("filter={status}");
    expect(route).toContain("page={page - 1}");
    expect(route).toContain("onTermChange={(next) => void navigate(");
    expect(route).toContain("onFilterChange={(next) => void navigate(");
    expect(route).toContain("onPageChange={(next) => void navigate(");
    expect(route).toContain("page: next + 1");
    expect(route).toContain("replace: true");
    expect(route).toContain("onReset={() => void navigate(");
    expect(screen).toContain("useEffect(() => setInput(term), [term])");
    expect(screen).toContain("onPageChange(lastPage)");
    expect(screen).toContain("page >= WORLD_DIRECTORY_MAX_PAGE_INDEX");
    expect(screen).toContain("onTermChange(cleanWorldSearch(input))");
  });
});
