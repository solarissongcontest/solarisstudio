import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = file(
  "supabase/migrations/20261104183000_v3_world_country_section_publication_rls.sql",
);
const rehearsal = file("scripts/rehearse-v3-world-country-section-publication.sql");
const runner = file("scripts/rehearse-v3-world-country-section-publication.sh");

describe("Terra Solaris Country/Wiki authored section publication RLS", () => {
  it("preserves canonical country-profile ownership and uses a forward-only S13 contract", () => {
    expect(migration).toContain("public.country_profile_sections");
    expect(migration).toContain("v3_register_migration_contract(");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.country_profile_sections/i);
  });

  it("denies sections hidden from both public surfaces to both browser roles", () => {
    expect(migration).toContain('create policy "country sections published anon read"');
    expect(migration).toContain("for select to anon");
    expect(migration).toContain("for select to authenticated");
    expect(migration).toMatch(/coalesce\(visible_on_country, false\)\s+or coalesce\(visible_on_wiki, false\)/);
    expect(migration).toContain('drop policy if exists "solaris consolidated anon read"');
    expect(migration).toContain('drop policy if exists "solaris consolidated authenticated read"');
  });

  it("retains owner and delegation manager access without adding write permissions", () => {
    expect(migration).toContain("or public.owns_country(country_id)");
    expect(migration).toContain("or public.studio2_access_allowed('delegation.manage', null, true)");
    expect(migration).not.toMatch(/grant\s+(?:all|insert|update|delete)\s+on/i);
    expect(migration).not.toMatch(/create policy[^;]+for (?:all|update|insert|delete)/i);
  });

  it("fails closed if a second permissive SELECT/ALL policy would bypass publication", () => {
    expect(migration).toContain("WORLD_COUNTRY_SECTION_UNKNOWN_PERMISSIVE_READ_POLICY");
    expect(migration).toContain("WORLD_COUNTRY_SECTION_READ_POLICY_OVERRIDDEN");
    expect(migration).toContain("p.cmd in ('SELECT','ALL')");
    expect(migration).toContain("p.permissive = 'PERMISSIVE'");
    expect(migration).toContain("alter table public.country_profile_sections enable row level security");
  });

  it("provides real local SQL tests of anon, outsider and owner reads plus owner editing", () => {
    for (const expression of [
      "set local role anon",
      "set local role authenticated",
      "TG3_ANON_HIDDEN_SECTION_DISCLOSURE",
      "TG3_OUTSIDER_HIDDEN_SECTION_DISCLOSURE",
      "TG3_OWNER_UNABLE_TO_READ_UNPUBLISHED_DRAFT",
      "TG3_OWNER_UNABLE_TO_EDIT_UNPUBLISHED_DRAFT",
      "rollback;",
    ]) {
      expect(rehearsal).toContain(expression);
    }
  });

  it("prohibits any hosted test endpoint or production credential fallback", () => {
    expect(runner).toContain("supabase status -o env");
    expect(runner).toContain("http://127.0.0.1:");
    expect(runner).toContain("postgres://postgres:postgres@127.0.0.1:");
    expect(runner).toContain('fail "Refusing non-loopback database"');
    expect(runner).toContain('psql "$DB_URL"');
    expect(runner).not.toContain('"${DATABASE_URL}"');
  });
});
