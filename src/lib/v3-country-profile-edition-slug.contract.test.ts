import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019235000_v3_country_profile_edition_slug.sql",
  ),
  "utf8",
);

describe("Public V3 country profile canonical edition slug", () => {
  it("projects the canonical slug from the same published edition row", () => {
    expect(migration).toContain("e.slug as edition_slug");
    expect(migration).toContain("and e.published = true");
    expect(migration).toContain("'edition_slug', er.edition_slug");
  });

  it("keeps participant visibility delegated to the existing public-safe projection", () => {
    expect(migration).toContain("public.public_safe_participants(null, null)");
    expect(migration).not.toMatch(/from\s+public\.participants\b/i);
    expect(migration).not.toMatch(/from\s+public\.results\b/i);
    expect(migration).not.toMatch(/from\s+public\.jury_votes\b/i);
    expect(migration).not.toMatch(/from\s+public\.televote_votes\b/i);
  });

  it("preserves the bounded one-country contract and anonymous-safe RPC boundary", () => {
    expect(migration).toContain("where upper(c.short_code) = upper(trim(coalesce(p_code, '')))");
    expect(migration).toContain("limit 1");
    expect(migration).toContain("grant execute on function public.v3_public_country_profile(text) to anon, authenticated");
  });

  it("is governed by the S13 migration framework", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019235000_v3_country_profile_edition_slug");
    expect(migration).toContain("'forward_fix_only'");
  });
});
