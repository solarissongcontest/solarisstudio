import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";
import { SOLARIS_CAPABILITIES } from "./permissions-v2";
import {
  STUDIO2_PRODUCT_SURFACES,
  studio2RolloutDecision,
} from "./studio2-product-surfaces";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("WORLD-01 TG11/TG12 private workspace registry integration", () => {
  it("registers private rooms and chat without enabling or misclassifying rollout", () => {
    for (const key of ["terra_private_spaces", "terra_chat"] as const) {
      expect(SOLARIS_FEATURE_FLAGS).toContain(key);
      expect(DEFAULT_SOLARIS_FEATURE_RULES[key].enabled).toBe(false);
      expect(STUDIO2_PRODUCT_SURFACES[key]).toMatchObject({
        state: "planned",
        audience: "delegation",
      });
      expect(studio2RolloutDecision(key, false, new Set())).toMatchObject({
        allowed: false,
        reason: "rollout_locked",
      });
    }

    expect(STUDIO2_PRODUCT_SURFACES.terra_chat.dependsOn).toContain("terra_private_spaces");
    expect(SOLARIS_CAPABILITIES).toContain("world.space.manage");
    expect(SOLARIS_CAPABILITIES).toContain("world.chat.moderate");
  });

  it("assigns authenticated private routes before the /world public catch-all", () => {
    const privateIndex = V3_PUBLIC_CAPABILITY_REGISTRY.findIndex(
      (item) => item.id === "terra-world-private-workspaces",
    );
    const publicWorldIndex = V3_PUBLIC_CAPABILITY_REGISTRY.findIndex(
      (item) => item.id === "terra-world-institutions",
    );
    expect(privateIndex).toBeGreaterThanOrEqual(0);
    expect(publicWorldIndex).toBeGreaterThan(privateIndex);

    const registration = V3_PUBLIC_CAPABILITY_REGISTRY[privateIndex];
    expect(registration).toMatchObject({
      sourceFeatureFlags: ["terra_private_spaces", "terra_chat"],
      authRequirement: "authenticated",
      legacyRoutes: ["/world/workspaces", "/world/workspaces/*"],
      targetArea: "me",
      targetRoute: "/world/workspaces",
      specificationStatus: "building",
    });
    expect(registration.sourceFeatureFlags).not.toContain("terra_world_public");
  });

  it("enforces both rollout flags through the canonical server read guard", () => {
    const sql = file("supabase/migrations/20261107223000_v3_tg11_tg12_private_spaces_chat.sql");

    // The private read helper is intentionally a single server-side authority:
    // every chat RPC must call it, and it must fail closed with spaces disabled.
    const helperStart = sql.indexOf("create function private.world_space_read_from_v1(");
    const helperEnd = sql.indexOf("\ncreate function public.world_spaces_list_v1(", helperStart);
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = sql.slice(helperStart, helperEnd);
    expect(helper).toContain("studio2_feature_enabled('terra_private_spaces',null)");
    expect(helper).toContain("then return null;");

    for (const operation of [
      "world_space_messages_v1",
      "world_space_search_v1",
      "world_space_send_v1",
      "world_space_edit_v1",
      "world_space_set_reaction_v1",
      "world_space_moderate_v1",
    ]) {
      const start = sql.indexOf("create function public." + operation + "(");
      expect(start, operation + " must exist in the producer's domain SQL").toBeGreaterThanOrEqual(0);
      const next = sql.indexOf("\ncreate function public.", start + 1);
      const body = sql.slice(start, next < 0 ? sql.length : next);
      expect(body, operation + " must deny when chat is disabled")
        .toContain("studio2_feature_enabled('terra_chat',null)");
      expect(body, operation + " must reuse the private server-side workspace gate")
        .toContain("private.world_space_read_from_v1(");
      expect(body, operation + " must fail closed server-side").toContain("FEATURE_DISABLED");
    }
  });

  it("requires distinct ownership and exact additive CHECK validation in V3 guards", () => {
    for (const path of [
      "scripts/check-v3-capability-registry.ts",
      "scripts/check-v3-s15-zero-orphan-readiness-core.ts",
      "src/lib/v3-registry.contract.test.ts",
    ]) {
      const source = file(path);
      expect(source, path).toContain('flag === "terra_private_spaces"');
      expect(source, path).toContain('flag === "terra_chat"');
    }

    const guard = file("src/lib/studio2-feature-flag-constraint.test.ts");
    expect(guard).toContain("in \\(%L,%L\\)");
    expect(guard).toContain("matches.length !== 1");
    expect(guard).toContain("additive.length !== requiredCount");
    expect(guard).toContain("pg_catalog\\.strpos");

    const sql = file("supabase/migrations/20261107223000_v3_tg11_tg12_private_spaces_chat.sql");
    expect(sql).toContain("or key in (%L,%L)");
    expect(sql).toContain("'terra_private_spaces', 'terra_chat'");
    expect(sql).toContain("('terra_private_spaces',false,false");
    expect(sql).toContain("('terra_chat',false,false");
  });
});
