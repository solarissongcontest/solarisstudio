import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016153000_v3_s8_identity_set_bulk_protection.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s8-identity-set-bulk-protection-rehearsal.sh",
);
const workflow = source(
  ".github/workflows/v3-s8-identity-set-bulk-protection-rehearsal.yml",
);

describe("System V3 S8 identity-set bulk protection", () => {
  it("bounds notice destination arrays by the complete valid destination universe", () => {
    expect(migration).toContain(
      "cardinality(coalesce(p_display_surfaces, '{}'::text[])) > 3",
    );
    expect(migration).toContain("Too many communication destinations");
    expect(migration).toContain(
      "array['delegation_inbox', 'mysolaris_home', 'public_home']::text[]",
    );
  });

  it("bounds specific-country audiences by the canonical country universe", () => {
    expect(migration).toContain("select count(*)::integer into v_country_count from public.countries");
    expect(migration).toContain("v_requested_count > v_country_count");
    expect(migration).toContain("Specific-country audience exceeds the canonical country universe");
    expect(rehearsal).toContain("oversized notice country audience");
  });

  it("bounds Confirmation requirement waves before reconciliation", () => {
    const limit = migration.indexOf("Confirmation requirement batch exceeds the canonical country universe");
    const reconcile = migration.indexOf("studio2_reconcile_confirmation_requirement");
    expect(limit).toBeGreaterThan(0);
    expect(reconcile).toBeGreaterThan(limit);
    expect(migration).toContain("studio2-confirmation-requirements:");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("preserves the existing optional country-set RPC contract while replacing the body", () => {
    // PostgreSQL CREATE OR REPLACE cannot silently remove an existing argument
    // default. More importantly, callers legitimately omit p_country_ids to
    // materialize the complete active-country set, so this is API compatibility.
    expect(migration).toContain(
      "p_country_ids uuid[] default null\n)\nreturns jsonb",
    );
  });

  it("preserves full valid-country and normal notice behavior", () => {
    expect(rehearsal).toContain("complete valid confirmation country batch");
    expect(rehearsal).toContain("valid targeted notice draft");
    expect(rehearsal).toContain("did not materialize exactly three requirements");
    expect(rehearsal).toContain("valid notice was not persisted");
  });

  it("keeps automated verification isolated from hosted Supabase", () => {
    expect(rehearsal).toContain('http://127.0.0.1:*|http://localhost:*');
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toContain("supabase.co");
  });
});