import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const world = read("src/components/world/WorldPublic.tsx");
const landing = read("src/routes/world/index.tsx");
const search = read("src/routes/world/search/index.tsx");
const reader = read("src/lib/terra-world-public.ts");
const searchReader = read("src/lib/terra-world-unified-search.ts");

describe("World editorial search reconciliation with one public authority", () => {
  it("rechecks the rollout before mounting World landing or Search", () => {
    expect(landing).toContain("<WorldPublicGate verifyOnMount>");
    expect(search).toContain("<WorldPublicGate verifyOnMount>");
    expect(world).toContain('refetchOnMount: "always"');
    expect(world).toContain("directory.isRefetchError");
  });

  it("preserves the editorial World landing while introducing bounded search", () => {
    expect(world).toContain('className="world-editorial-landing"');
    expect(world).toContain('to="/world/search"');
    expect(world).toContain('to="/world/organizations"');
    expect(world).toContain('to="/world/countries"');
    expect(world).toContain('to="/countries"');
    expect(searchReader).toContain("WORLD_UNIFIED_SEARCH_LIMIT = 12");
    expect(searchReader).toContain("WORLD_UNIFIED_SEARCH_MAX_PAGE = 1000");
  });

  it("denies pre-recognition, stale, or private organization publication", () => {
    expect(reader).toContain("WORLD_PUBLIC_INSTITUTION_STATUSES");
    expect(reader).toContain("!isPublicWorldInstitutionStatus(organization.status)");
    expect(reader).toContain('eq("public_visibility", "public")');
    expect(reader).toContain('in("status", [...WORLD_PUBLIC_INSTITUTION_STATUSES])');
    expect(searchReader).toContain('eq("public_visibility", "public")');
    expect(searchReader).toContain("worldPublicQueryVerified");
  });
});
