import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_restore_public_rls_runtime_privileges.sql"),
);
if (!migrationName) throw new Error("Public RLS runtime privilege repair migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Public RLS runtime privilege repair", () => {
  it("restores anon execution only on the narrow public RLS predicates", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "grant execute on function public.studio2_access_allowed(text, uuid, boolean) to anon, authenticated, service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.owns_country(uuid) to anon, authenticated, service_role;",
    );
    expect(migration).not.toContain("grant select on public.country_accounts to anon");
  });

  it("rebuilds the consolidated participant SELECT policies without direct account-table reads", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      'drop policy if exists "solaris consolidated anon read" on public.participants;',
    );
    expect(sql).toContain(
      'drop policy if exists "solaris consolidated authenticated read" on public.participants;',
    );
    expect(sql).toContain(
      'create policy "solaris consolidated anon read" on public.participants for select to anon',
    );
    expect(sql).toContain(
      'create policy "solaris consolidated authenticated read" on public.participants for select to authenticated',
    );
    expect(sql).toContain("public.owns_country(country_id)");
    expect(sql).not.toContain("from public.country_accounts");
  });

  it("preserves authenticated private-entry visibility inherited from pre-consolidation write policy", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "public.studio2_access_allowed('entry.edit', edition_id, true)",
    );
    expect(sql).toContain(
      "public.studio2_access_allowed('entry.read_private', edition_id, false)",
    );
  });

  it("guards every browser-applicable participant policy against private account-table access", () => {
    expect(migration).toContain("participants browser RLS still reads country_accounts directly");
    expect(migration).toContain("participants must expose exactly one anon SELECT policy");
    expect(migration).toContain("participants must expose exactly one authenticated SELECT policy");
    expect(migration).toContain("has_function_privilege(");
  });
});
