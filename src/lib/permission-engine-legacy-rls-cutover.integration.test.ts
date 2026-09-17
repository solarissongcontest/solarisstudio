import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_legacy_rls_cutover.sql"),
);
if (!migrationName) throw new Error("Permission Engine legacy RLS cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Permission Engine legacy RLS cutover", () => {
  it("rewrites existing policy expressions rather than replacing their surrounding semantics", () => {
    expect(migration).toContain("from pg_policies");
    expect(migration).toContain("v_qual := r.qual");
    expect(migration).toContain("v_check := r.with_check");
    expect(migration).toContain("replace(v_qual");
    expect(migration).toContain("replace(v_check");
    expect(migration).toContain("alter policy %I on %I.%I");
  });

  it("maps policy families to existing capabilities", () => {
    const sql = normalized(migration);
    for (const capability of ["edition.manage", "entry.edit", "rollout.manage", "voting.manage"]) {
      expect(sql).toContain(`'${capability}'`);
    }
    expect(sql).toContain("r.schemaname = 'televoting' then 'voting.manage'");
    expect(sql).toContain("r.tablename in ('prediction_rounds', 'televoting_round_bindings') then 'voting.manage'");
    expect(sql).toContain("r.tablename in ('edit_tokens', 'internal_entries') then 'entry.edit'");
    expect(sql).toContain("r.tablename in ('integration_events', 'integration_links') then 'rollout.manage'");
  });

  it("keeps canonical edition scope where policy rows expose it", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "public.studio2_access_allowed(''voting.manage'', (select s.edition_id from public.shows s where s.id = prediction_rounds.show_id), false)",
    );
    expect(sql).toContain(
      "public.studio2_access_allowed(''voting.manage'', edition_id, false)",
    );
  });

  it("uses non-strict compatibility checks and fails closed on drift", () => {
    expect(migration).toContain("studio2_access_allowed");
    expect(migration).toContain("false)");
    expect(migration).toContain("Unmapped legacy RLS policy");
    expect(migration).toContain("Legacy role predicate survived RLS rewrite");
    expect(migration).toContain("Expected 43 direct legacy RLS policies");
    expect(migration).toContain("v_count <> 43");
    expect(migration).toContain("v_remaining <> 0");
  });

  it("does not alter the bootstrap organizer policy or enable v2", () => {
    expect(migration).not.toContain("bootstrap first organizer");
    expect(migration).not.toContain("organizer_exists()");
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
