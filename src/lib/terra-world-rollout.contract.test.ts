import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_FEATURE_FLAGS } from "./feature-flags";
import { STUDIO2_PRODUCT_SURFACES } from "./studio2-product-surfaces";
import { V3_PUBLIC_CAPABILITY_REGISTRY, V3_PUBLIC_FEATURE_FLAGS } from "./v3-public-capability-registry";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Terra Solaris TG3 discovery rollout", () => {
  it("registers the public World key in the canonical flag and product registries", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("terra_world_public");
    expect(STUDIO2_PRODUCT_SURFACES.terra_world_public).toMatchObject({
      route: "/world",
      audience: "public",
      state: "integrated",
    });
  });

  it("registers all TG3 World public routes under one declared Public owner", () => {
    const registry = file("src/lib/v3-public-capability-registry.ts");
    const guard = file("scripts/check-v3-capability-registry.ts");
    const world = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === "terra-world-institutions");
    expect(world).toMatchObject({
      targetArea: "explore",
      targetRoute: "/world",
      specificationStatus: "building",
      sourceFeatureFlags: ["terra_world_public"],
      legacyRoutes: ["/world", "/world/*"],
    });
    expect(V3_PUBLIC_FEATURE_FLAGS.has("terra_world_public")).toBe(true);
    expect(registry).toContain('id: "terra-world-institutions"');
    expect(registry).toContain('legacyRoutes: ["/world", "/world/*"]');
    expect(registry).toContain('sourceFeatureFlags: ["terra_world_public"]');
    expect(registry).toContain('specificationStatus: "building"');
    expect(guard).toContain('flag.startsWith("solaris_app_v3") || flag === "terra_world_public"');
  });

  it("persists a dark-by-default boolean rollout while retaining historical flag keys", () => {
    const source = file("supabase/migrations/20261104121000_v3_tg3_world_public_rollout_flag.sql");
    expect(source).toContain("add constraint studio2_feature_flags_key_check check");
    expect(source).toContain("'terra_world_public'");
    expect(source).toContain("'solaris_app_v3_live'");
    expect(source).toContain("'solaris_app_v3_organizer'");
    expect(source).toContain("('terra_world_public', false, false");
    expect(source).toContain("on conflict (key) do nothing");
  });

  it("makes both Explore experiences discover World only after canonical rollout", () => {
    const entry = file("src/components/world/WorldExploreEntry.tsx");
    const legacy = file("src/routes/explore/index.tsx");
    const v3 = file("src/components/v3/V3ExploreScreen.tsx");
    const gate = file("src/components/v3/V3ExploreRouteGate.tsx");
    expect(entry).toContain("fetchWorldPublicEnabled");
    expect(entry).toContain("if (rollout.data !== true) return null");
    expect(entry).toContain("if (!enabled) return null");
    expect(entry).toContain('to="/world"');
    expect(legacy).toContain("<WorldExploreEntry />");
    expect(v3).toContain("<WorldV3ExploreEntry enabled={showWorld} />");
    expect(gate).toContain("enabled: shouldLoadBundle");
    expect(gate).toContain("showWorld={worldRollout.data === true}");
  });
  it("supports canonical leadership and member deep links without a second private reader", () => {
    for (const section of ["leadership", "members"]) {
      const source = file(`src/routes/world/organizations/$slug_.${section}.tsx`);
      expect(source).toContain(`createFileRoute("/world/organizations/$slug/${section}")`);
      expect(source).toContain('to: "/world/organizations/$slug"');
      expect(source).toContain(`search: { tab: "${section}" }`);
      expect(source).not.toContain("supabase");
    }
  });
});
