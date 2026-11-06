import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261104184000_v3_tg3_country_section_publication_rls.sql");
const data = source("src/lib/world-country-government-data.ts");
const model = source("src/lib/world-country-government.ts");

describe("TG3 country section publication authority", () => {
  it("removes the permissive true policies instead of layering a second OR-ed RLS policy", () => {
    expect(migration).toContain('drop policy if exists "solaris consolidated anon read"');
    expect(migration).toContain('drop policy if exists "solaris consolidated authenticated read"');
    expect(migration).toContain('for select to anon');
    expect(migration).toContain('for select to authenticated');
    expect(migration).not.toMatch(/\bor true\b|\busing\s*\(\s*true\s*\)/i);
  });

  it("fails closed on unknown permissive read policies before and after migration", () => {
    expect(migration).toContain("WORLD_COUNTRY_SECTION_PUBLICATION_SCHEMA_NOT_READY");
    expect(migration).toContain("WORLD_COUNTRY_SECTION_UNKNOWN_PERMISSIVE_READ_POLICY");
    expect(migration).toContain("WORLD_COUNTRY_SECTION_READ_POLICY_OVERRIDDEN");
    expect(migration).toContain("WORLD_COUNTRY_SECTION_READ_POLICY_MISSING");
    expect(migration).toContain("p.permissive = 'PERMISSIVE'");
    expect(migration).toContain("p.cmd in ('SELECT','ALL')");
    expect(migration).toContain("from pg_policies p");
    expect(migration).not.toContain("drop policy if exists \"country sections owner or capability write update\"");
  });

  it("exposes only explicitly Country/Wiki-visible sections to anonymous readers", () => {
    expect(migration).toMatch(/for select to anon\s+using\s*\(\s*visible_on_country is true\s+or visible_on_wiki is true\s*\)/i);
    expect(data).toContain(".or(\"visible_on_country.eq.true,visible_on_wiki.eq.true\")");
    expect(data).toContain("visible_on_country,visible_on_wiki");
    expect(model).toContain("row.visible_on_country !== true && row.visible_on_wiki !== true");
  });

  it("keeps existing country-controller and Organizer editor reads of unpublished material", () => {
    expect(migration).toContain("public.owns_country(country_id)");
    expect(migration).toContain("public.studio2_access_allowed('delegation.manage', null, true)");
    expect(migration).not.toMatch(/grant\s+(?:all|insert|update|delete)\s+on\s+public\.country_profile_sections/i);
  });

  it("registers a forward-only S13 migration and preserves unrelated table policies", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain("v3.tg3.country-section-publication-rls");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("alter table public.country_profile_sections enable row level security");
    expect(migration).not.toContain("drop policy if exists \"country sections owner or capability write update\"");
    expect(migration).not.toMatch(/(drop|truncate)\s+table\b/i);
  });

  it("provides executable local-only negative and owner-scope regression", () => {
    const sql = source("scripts/rehearse-v3-world-country-publication.sql");
    const wrapper = source("scripts/rehearse-v3-world-country-publication.sh");
    expect(sql).toContain("set local role anon");
    expect(sql).toContain("set local role authenticated");
    expect(sql).toContain("both-hidden");
    // These must be real actor-specific RLS checks, not authenticated role
    // simulation without a signed-in outsider or a private-draft edit.
    expect(sql).toContain("v_outsider uuid := gen_random_uuid()");
    expect(sql).toContain("'solaris.tg3_publication_outsider'");
    expect(sql).toContain("set_config('request.jwt.claim.sub'");
    expect(sql).toContain("set_config('request.jwt.claims'");
    expect(sql).toContain("TG3_SIGNED_IN_OUTSIDER_SAW_HIDDEN_CONTENT");
    expect(sql).toContain("TG3_SIGNED_IN_OUTSIDER_EDITED_HIDDEN_CONTENT");
    expect(sql).toContain("TG3_COUNTRY_OWNER_FIXTURE_INVALID");
    expect(sql).toContain("TG3_ACTIVE_COUNTRY_CONTROLLER_CANNOT_EDIT_DRAFT");
    expect(sql).toContain("get diagnostics v_updated = row_count");

    expect(sql).toContain("rollback;");
    expect(wrapper).toContain("supabase status -o env");
    expect(wrapper).toContain("Refusing hosted/non-loopback");
    expect(wrapper).toContain('psql "$DB_URL"');
  });
});
