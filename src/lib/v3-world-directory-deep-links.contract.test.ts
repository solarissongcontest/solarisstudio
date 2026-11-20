import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/world/organizations/index.tsx", "utf8");
const view = readFileSync("src/components/world/WorldPublic.tsx", "utf8");
const reader = readFileSync("src/lib/terra-world-public.ts", "utf8");

describe("World institution directory deep links", () => {
  it("validates the search term, publication status and bounded page before querying", () => {
    expect(route).toContain("validateSearch:");
    expect(route).toContain("cleanWorldSearch(search.q)");
    expect(route).toContain('search.status === "current" || search.status === "historical"');
    expect(route).toContain("parseWorldDirectoryUrlPage(search.page)");
    expect(route).toContain("<WorldPublicGate verifyOnMount>");
    expect(reader).toContain('eq("public_visibility", "public")');
  });

  it("keeps the URL and the visible search, status and page synchronized", () => {
    expect(route).toContain("term={q}");
    expect(route).toContain("filter={status}");
    expect(route).toContain("page={page - 1}");
    expect(route).toContain("onTermChange={(next) => void navigate(");
    expect(route).toContain("onFilterChange={(next) => void navigate(");
    expect(route).toContain("onPageChange={(next) => void navigate(");
    expect(route).toContain("page: next + 1");
    expect(route).toContain('search: { q: "", status: "all", page: 1 }');
    expect(view).toContain("useEffect(() => setInput(term), [term])");
    expect(view).toContain("onPageChange(Math.max(0, page - 1))");
    expect(view).toContain("page >= WORLD_DIRECTORY_MAX_PAGE_INDEX");
  });

  it("passes the canonical validated directory search on every World organization index link", () => {
    const owners = [
      "src/components/world/WorldBodiesPublic.tsx",
      "src/components/world/WorldCountryInternational.tsx",
      "src/components/world/WorldExploreEntry.tsx",
      "src/components/world/WorldPublic.tsx",
      "src/components/world/WorldUnifiedSearch.tsx",
    ];
    const expected = 'search={{ q: "", status: "all", page: 1 }}';
    let checked = 0;
    for (const path of owners) {
      const source = readFileSync(path, "utf8");
      const references = [...source.matchAll(/to="\\/world\\/organizations"/g)];
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) {
        expect(source.slice(reference.index!, reference.index! + 95)).toContain(expected);
        checked++;
      }
    }
    expect(checked).toBe(9);
  });
});
