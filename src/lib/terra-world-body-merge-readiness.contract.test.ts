import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The TG3 body PR may merge independently before World Search, but must never
 * expose private offices, unrecognized parent unions or an unverified rollout.
 * This contract uses local source only: no hosted Supabase or browser network.
 */
describe("TG3 institutional body standalone merge contract", () => {
  const bodies = readFileSync(resolve(process.cwd(),
    "src/lib/terra-world-bodies-public.ts"), "utf8");
  const gate = readFileSync(resolve(process.cwd(),
    "src/lib/terra-world-rollout-gate.ts"), "utf8");
  const profile = readFileSync(resolve(process.cwd(),
    "src/components/world/WorldPublic.tsx"), "utf8");

  it("limits public parents to recognized, active and historical status", () => {
    const supported = ["recognized", "active", "suspended", "historical", "dissolved"];
    for (const status of supported) {
      expect(bodies).toContain('"' + status + '"');
    }
    expect(bodies).toContain("worldBodyParentPublished(parent.status)");
    expect(bodies).toContain("worldBodyParentPublished(row.status)");
    expect(bodies).toContain('.in("status", [...WORLD_PUBLISHED_BODY_PARENT_STATUSES])');
    expect(bodies).not.toContain('"proposed", "active"');
  });

  it("constrains body, detail, recount and office reads to the same published parent", () => {
    expect(bodies.split("world_organizations!inner(id,public_visibility,status)").length - 1)
      .toBe(4);
    expect(bodies.split('.in("world_organizations.status", [...WORLD_PUBLISHED_BODY_PARENT_STATUSES])').length - 1)
      .toBe(4);
    expect(bodies).toContain('eq("visibility", "public")');
  });

  it("keeps body pages behind canonical, fresh rollout permission", () => {
    expect(profile).toContain("publicWorldRolloutDisplay(rollout, verifyOnMount)");
    for (const path of [
      "src/routes/world/organizations/$slug_/bodies/index.tsx",
      "src/routes/world/organizations/$slug_/bodies/$bodySlug.tsx",
    ]) {
      const route = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(route).toContain("<WorldPublicGate verifyOnMount>");
    }
    expect(gate).toContain("verifyOnMount && (!state.isFetchedAfterMount || state.isFetching)");
  });
});
