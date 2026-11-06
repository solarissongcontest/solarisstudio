import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Integrated Terra Solaris public discovery chain", () => {
  const landing = source("src/components/world/WorldPublic.tsx");
  const bodyReader = source("src/lib/terra-world-bodies-public.ts");
  const search = source("src/components/world/WorldUnifiedSearch.tsx");
  const searchRoute = source("src/routes/world/search/index.tsx");
  const classic = source("src/routes/explore/index.tsx");
  const v3 = source("src/components/v3/V3ExploreScreen.tsx");
  const v3Gate = source("src/components/v3/V3ExploreRouteGate.tsx");
  const entry = source("src/components/world/WorldExploreEntry.tsx");
  const rollout = source("src/lib/terra-world-rollout-gate.ts");

  it("connects classic and installed-app Explore to the same World publication authority", () => {
    expect(classic).toContain("<WorldExploreEntry />");
    expect(v3).toContain("<WorldV3ExploreEntry enabled={showWorld} />");
    expect(v3Gate).toContain('queryKey: ["world", "public", "rollout"]');
    expect(v3Gate).toContain("worldPublicQueryVerified(worldRollout)");
    expect(entry).toContain("worldPublicQueryVerified(rollout)");
    expect(entry).toContain('refetchOnMount: "always"');
    expect(entry).not.toContain('from("world_organizations")');
  });

  it("connects World Landing to Search, official profiles and body routes", () => {
    expect(landing).toContain('to="/world/search"');
    expect(landing).toContain('to="/world/organizations"');
    expect(landing).toContain('to="/world/organizations/$slug/bodies/$bodySlug"');
    expect(landing).toContain('to="/world/organizations/$slug/bodies/"');
    expect(landing).toContain("verifiedProjection.organs");
    expect(existsSync(resolve(process.cwd(),
      "src/routes/world/organizations/$slug_/bodies/index.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(),
      "src/routes/world/organizations/$slug_/bodies/$bodySlug.tsx"))).toBe(true);
  });

  it("revalidates on entry to search, organization directory, profile and body routes", () => {
    for (const route of [
      searchRoute,
      source("src/routes/world/organizations/index.tsx"),
      source("src/routes/world/organizations/$slug.tsx"),
      source("src/routes/world/organizations/$slug_/bodies/index.tsx"),
      source("src/routes/world/organizations/$slug_/bodies/$bodySlug.tsx"),
    ]) {
      expect(route).toContain("<WorldPublicGate verifyOnMount>");
    }
    expect(landing).toContain("publicWorldRolloutDisplay(rollout, verifyOnMount)");
    expect(rollout).toContain("state.isError || state.isRefetchError");
    expect(rollout).toContain("state.isPending || state.isFetching");
    expect(rollout).toContain("verifyOnMount && !state.isFetchedAfterMount");
  });

  it("keeps published World landing and historical section links canonical", () => {
    expect(source("src/routes/world/index.tsx"))
      .toContain("<WorldPublicGate verifyOnMount><WorldLanding /></WorldPublicGate>");
    const leadership = source("src/routes/world/organizations/$slug_.leadership.tsx");
    const members = source("src/routes/world/organizations/$slug_.members.tsx");
    for (const redirect of [leadership, members]) {
      expect(redirect).toContain('to: "/world/organizations/$slug"');
      expect(redirect).toContain("replace: true");
    }
    expect(leadership).toContain('search: { tab: "leadership" }');
    expect(members).toContain('search: { tab: "members" }');
  });

  it("requires an officially published parent in every body or office read", () => {
    expect(bodyReader).toContain("worldBodyParentPublished(row.status)");
    expect(bodyReader).toContain("worldBodyParentPublished(parent.status)"));
    expect(bodyReader).toContain('.in("status", [...WORLD_PUBLISHED_BODY_PARENT_STATUSES])');
    expect(bodyReader.split('world_organizations!inner(id,public_visibility,status)').length - 1)
      .toBe(4);
    expect(bodyReader.split('.in("world_organizations.status", [...WORLD_PUBLISHED_BODY_PARENT_STATUSES])').length - 1)
      .toBe(4);
    expect(bodyReader).not.toContain("select(\"*\"");
    const canonicalStatuses = source("src/lib/terra-world-public.ts")
      .match(/WORLD_PUBLIC_INSTITUTION_STATUSES = \[([\s\S]*?)\] as const;/)?.[1];
    const bodyStatuses = bodyReader
      .match(/WORLD_PUBLISHED_BODY_PARENT_STATUSES = \[([\s\S]*?)\] as const;/)?.[1];
    expect(bodyStatuses?.replace(/\s+/g, "")).toBe(canonicalStatuses?.replace(/\s+/g, ""));
  });

  it("keeps exactly one page-level main landmark in the Search shell", () => {
    expect(source("src/components/AppShell.tsx")).toContain("<main");
    expect(search).toContain("<AppShell>");
    expect(search).not.toContain("<AppShell><main");
    expect(search).not.toContain('<main className="mx-auto w-full max-w-5xl');
  });

  it("retains the dark-by-default canonical rollout and source registration", () => {
    const flags = source("src/lib/feature-flags.ts");
    const registry = source("src/lib/v3-public-capability-registry.ts");
    const migration = source("supabase/migrations/20261104121000_v3_tg3_world_public_rollout_flag.sql");
    expect(flags).toContain("terra_world_public");
    expect(registry).toContain('sourceFeatureFlags: ["terra_world_public"]');
    expect(migration).toContain("('terra_world_public', false, false");
    expect(migration).toContain("on conflict (key) do nothing");
  });
});
