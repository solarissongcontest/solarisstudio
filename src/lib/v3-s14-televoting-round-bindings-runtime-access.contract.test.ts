import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(suffix: string) {
  const name = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((candidate) =>
    candidate.endsWith(suffix),
  );
  if (!name) throw new Error(`Migration missing: ${suffix}`);
  return readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
}

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

const runtimeAccess = readMigration("_v3_s14_televoting_round_bindings_runtime_access.sql");
const permissionCutover = readMigration("_permission_engine_v2_public_legacy_rls_cutover.sql");

describe("S14 Televote round-binding runtime access", () => {
  it("restores authenticated DML only beneath RLS", () => {
    const sql = normalized(runtimeAccess);

    expect(sql).toContain(
      "grant select, insert, update, delete on table public.televoting_round_bindings to authenticated;",
    );
    expect(sql).not.toContain("to anon");
    expect(sql).not.toContain("to public");
    expect(sql).not.toContain("disable row level security");
  });

  it("fails migration replay if RLS or any required authenticated privilege is missing", () => {
    const sql = normalized(runtimeAccess);

    expect(sql).toContain("c.relrowsecurity");
    expect(sql).toContain("televoting_round_bindings must remain protected by rls");
    for (const privilege of ["select", "insert", "update", "delete"]) {
      expect(sql).toContain(
        `has_table_privilege('authenticated', 'public.televoting_round_bindings', '${privilege}')`,
      );
    }
  });

  it("keeps voting.manage RLS as the canonical authorization authority", () => {
    const sql = normalized(permissionCutover);

    expect(sql).toContain('create policy "televoting round bindings organizer only"');
    expect(sql).toContain("public.studio2_access_allowed('voting.manage', edition_id, false)");
  });
});
