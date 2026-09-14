import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_strict_dual_guards.sql"),
);

describe("Permission Engine v2 strict-dual table guards", () => {
  it("guards all organizer-only high-risk write boundaries", () => {
    expect(migrationName).toBeTruthy();
    const migration = source(`supabase/migrations/${migrationName}`);

    for (const trigger of [
      "studio2_edition_runtime_strict_dual_guard",
      "studio2_incidents_strict_dual_guard",
      "studio2_feature_flags_strict_dual_guard",
    ]) {
      expect(migration).toContain(`create trigger ${trigger}`);
    }
  });

  it("requires both decisions and records server-side evidence", () => {
    const migration = source(`supabase/migrations/${migrationName}`);
    expect(migration).toContain("public.studio2_check_capability_shadow(");
    expect(migration).toContain("v_decision ->> 'legacyAllowed'");
    expect(migration).toContain("v_decision ->> 'capabilityAllowed'");
    expect(migration).toContain("or not coalesce");
  });

  it("keeps global rollout scope stricter than edition-scoped rollout", () => {
    const migration = source(`supabase/migrations/${migrationName}`);
    expect(migration).toContain("cardinality(v_existing_scopes) = 0");
    expect(migration).toContain("cardinality(v_requested_scopes) = 0");
    expect(migration).toContain("v_existing_scopes || v_requested_scopes");
    expect(migration).toContain("'rollout.manage',\n      null");
  });
});
