import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("Public Terra Solaris World Search integration", () => {
  const landing = source("src/components/world/WorldPublic.tsx");
  const worldRoute = source("src/routes/world/index.tsx");
  const searchRoute = source("src/routes/world/search/index.tsx");
  const searchScreen = source("src/components/world/WorldUnifiedSearch.tsx");
  const registry = source("src/lib/v3-public-capability-registry.ts");

  it("makes the new search discoverable from the existing World landing", () => {
    const landingComponent = landing.slice(landing.indexOf("export function WorldLanding()"));
    expect(landingComponent).toContain('to="/world/search"');
    expect(landingComponent).toContain("Search the world");
    expect(landingComponent).toContain('to="/world/organizations"');
    expect(landingComponent).toContain('to="/countries"');
  });

  it("preserves the publication gate around both the landing and the search route", () => {
    expect(worldRoute).toContain("<WorldPublicGate><WorldLanding /></WorldPublicGate>");
    expect(searchRoute).toContain("<WorldPublicGate>");
    expect(searchRoute).toContain("<WorldUnifiedSearchPage");
    expect(searchRoute).toContain('createFileRoute("/world/search/")');
    expect(searchRoute).toContain("parseWorldSearchCategory(search.type)");
    expect(searchRoute).toContain("onCategoryChange=");
    expect(searchRoute).toContain("c: 0, o: 0, type: parseWorldSearchCategory(next)");
  });

  it("keeps World Landing and Search on the same publication lifecycle contract", () => {
    const reader = source("src/lib/terra-world-public.ts");
    const searchReader = source("src/lib/terra-world-unified-search.ts");
    expect(reader).toContain('in("status", [...WORLD_PUBLIC_INSTITUTION_STATUSES])');
    expect(reader).toContain("isPublicWorldInstitutionStatus(item.status)");
    expect(searchReader).toContain("WORLD_PUBLIC_INSTITUTION_STATUSES");
    expect(landing).toContain("worldPublicQueryVerified(directory)");
    expect(landing).toContain("directory.isRefetchError");
  });

  it("does not display cached results while publication queries are revalidating or failed", () => {
    expect(searchScreen).toContain("worldPublicQueryVerified(countryQuery)");
    expect(searchScreen).toContain("worldPublicQueryVerified(organizationQuery)");
    expect(searchScreen).toContain("worldPublicQueryVerified(featured)");
    expect(searchScreen).toContain("countryQuery.isRefetchError");
    expect(searchScreen).toContain("organizationQuery.isRefetchError");
    expect(searchScreen).toContain("featured.isRefetchError");
    expect(searchScreen).toContain("Verifying public institutions");
  });

  it("reuses the existing World capability instead of adding a competing rollout flag", () => {
    expect(registry).toContain('legacyRoutes: ["/world", "/world/*"]');
    expect(registry).toContain('sourceFeatureFlags: ["terra_world_public"]');
    expect(searchScreen).toContain('queryKey: ["world", "public", "featured"]');
    expect(searchScreen).not.toContain("setInterval(");
  });
});
