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

  it("removes direct country_accounts access from participant public RLS", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      'create policy "participants unreleased owner or capability read" on public.participants for select',
    );
    expect(sql).toContain("or public.owns_country(country_id)");
    expect(sql).not.toContain("from public.country_accounts");
  });

  it("contains executable migration guards for both privileges and policy privacy", () => {
    expect(migration).toContain("has_function_privilege(");
    expect(migration).toContain("'public.studio2_access_allowed(text,uuid,boolean)'");
    expect(migration).toContain("'public.owns_country(uuid)'");
    expect(migration).toContain("participants public RLS must not read country_accounts directly");
  });
});
