import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024153000_v3_televote_public_rls_boundary.sql",
  ),
  "utf8",
);

describe("V3 Televote public RLS boundary", () => {
  it("adopts the forward migration contract instead of bypassing S13", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain(
      "'20261024153000_v3_televote_public_rls_boundary'",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it("removes unconditional browser reads from operational Televoting configuration", () => {
    for (const table of ["rounds", "round_entries", "round_countries"]) {
      expect(migration).toContain(
        `drop policy if exists \"solaris consolidated anon read\" on televoting.${table};`,
      );
      expect(migration).toContain(
        `drop policy if exists \"solaris consolidated authenticated read\" on televoting.${table};`,
      );
    }

    expect(migration).toContain("Unconditional browser Televoting configuration policy remains");
  });

  it("keeps public round visibility state-bound", () => {
    expect(migration).toContain("status = 'open'::televoting.round_status");
    expect(migration).toContain("results_status = 'published'");
    expect(migration).toContain("public.televoting_round_bindings");
    expect(migration).toContain("binding.remote_round_id = rounds.id::text");
    expect(migration).toContain("binding.show_id is not null");
  });

  it("does not expose closed unpublished ballot composition", () => {
    expect(migration).toContain("round_row.id = round_entries.round_id");
    expect(migration).toContain("round_row.id = round_countries.round_id");
    expect(migration).toContain(
      "round_row.status = 'open'::televoting.round_status",
    );
    expect(migration).toContain("round_row.results_status = 'published'");
    expect(migration).not.toContain(
      "round_row.status = 'closed'::televoting.round_status",
    );
  });

  it("preserves Organizer voting.manage reads across every restricted table", () => {
    expect(migration.match(/studio2_access_allowed\('voting\.manage'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain(
      "Organizer Televoting read capability missing after public RLS hardening",
    );
  });
});
