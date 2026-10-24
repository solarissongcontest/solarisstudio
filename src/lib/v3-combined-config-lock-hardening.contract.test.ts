import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024230000_v3_combined_config_lock_hardening.sql",
  ),
  "utf8",
);

describe("System V3 Combined child-parent lock hardening", () => {
  it("registers the forward migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.combined-config-lock-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "'Harden Combined configuration CAS coexistence by converting child-parent lock collisions into deterministic retry conflicts.'",
    );
  });

  it("locks the aggregate CAS row NOWAIT before trigger-driven config touch", () => {
    expect(migration).toContain("for update nowait;");
    expect(migration).toContain("when lock_not_available then");
    expect(migration).toContain("errcode = 'PT409'");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
  });

  it("performs the version/outdated mutation only after the no-wait lock succeeds", () => {
    const lock = migration.indexOf("for update nowait;");
    const update = migration.indexOf("update televoting.televote_aggregations aggregation");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(lock);
    expect(migration).toContain("config_version = aggregation.config_version + 1");
    expect(migration).toContain("when aggregation.calculation_version > 0 then true");
  });

  it("keeps the helper private and transactional", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_touch_combined_configuration(uuid)\n  from public, anon, authenticated;",
    );
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});