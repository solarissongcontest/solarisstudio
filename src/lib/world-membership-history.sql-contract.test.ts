import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261104175500_v3_tg3_public_country_membership_history.sql", import.meta.url),
  "utf8",
);

describe("TG3 scoped public membership history SQL contract", () => {
  it("exposes one read-only institutional projection on canonical TG2 tables", () => {
    expect(migration).toMatch(
      /create or replace function public\.world_public_country_membership_history_v1\(\s*p_slug text,\s*p_country_id uuid\s*\)/i,
    );
    expect(migration).toMatch(/returns jsonb\s+language sql\s+stable\s+security definer\s+set search_path = pg_catalog/i);
    for (const name of [
      "world_organizations",
      "world_organization_memberships",
      "world_organization_representations",
      "world_office_terms",
      "world_organization_offices",
      "delegation_people",
    ]) {
      expect(migration).toContain("public." + name);
    }
    expect(migration).not.toMatch(/\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\.world_/i);
  });

  it("requires an explicitly public organization and an existing country", () => {
    expect(migration).toContain("organization_row.public_visibility = 'public'");
    expect(migration).toContain("organization_row.slug = lower(btrim(p_slug))");
    expect(migration).toContain("where country_row.id = p_country_id");
    expect(migration).toContain("where p_country_id is not null");
  });

  it("scopes every membership, representation and office term by country in SQL", () => {
    expect(migration).toContain("membership_row.country_id = p_country_id");
    expect(migration).toContain("representation_row.country_id = p_country_id");
    expect(migration).toContain("term_row.represented_country_id = p_country_id");
    expect(migration).toContain("term_row.actual_end_at is null");
    expect(migration).toContain("term_row.status = 'active'");
    expect(migration).toContain("office_row.active");
  });

  it("does not include auth or proxy identities in returned JSON", () => {
    for (const key of [
      "'userId'", "'personId'", "'holderPersonId'", "'proxyUserId'",
      "'authId'", "'capability'", "'privateGrant'", "'draft'",
    ]) {
      expect(migration).not.toContain(key);
    }
    expect(migration).toContain("'holderDisplayName'");
    expect(migration).toContain("'displayName'");
  });

  it("restricts function grants and registers the additive migration contract", () => {
    expect(migration).toMatch(
      /revoke all on function public\.world_public_country_membership_history_v1\(text,uuid\)\s+from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.world_public_country_membership_history_v1\(text,uuid\)\s+to anon, authenticated, service_role/i,
    );
    expect(migration).toContain("'v3.tg3.public-country-membership-history'");
    expect(migration).toContain("'forward_fix_only'");
  });
});
