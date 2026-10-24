import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261024153000_v3_televote_public_rls_boundary.sql"),
  "utf8",
);

describe("V3 Televote public RLS boundary", () => {
  it("adopts the forward migration contract instead of bypassing S13", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain("'v3.televote.public-rls-boundary'");
    expect(migration).toContain("'forward_fix_only'");
    const key = /v3_register_migration_contract\(\s*'([^']+)'/.exec(migration)?.[1];
    // Same strict semantic-key grammar as the installed S13 registrar.
    expect(key).toMatch(/^[a-z][a-z0-9_.:-]{2,159}$/);
    expect(key).not.toMatch(/^\d{14}_/);
  });

  it("removes unconditional browser reads from operational Televoting configuration", () => {
    for (const table of ["rounds", "round_entries", "round_countries"]) {
      expect(migration).toContain(
        `drop policy if exists "solaris consolidated anon read" on televoting.${table};`,
      );
      expect(migration).toContain(
        `drop policy if exists "solaris consolidated authenticated read" on televoting.${table};`,
      );
    }

    expect(migration).toContain("Unconditional browser Televoting configuration policy remains");
  });

  it("resolves a closed show-bound round without exposing the Organizer-only binding table", () => {
    expect(migration).toContain("function public.v3_public_televote_round_show_visible");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("from public.televoting_round_bindings binding");
    expect(migration).toContain("join public.shows show_row");
    expect(migration).toContain("show_row.published = true");
    expect(migration).toContain(
      "grant execute on function public.v3_public_televote_round_show_visible(uuid)",
    );
    expect(migration).toContain("to anon, authenticated, service_role");
  });

  it("keeps public round visibility state-bound", () => {
    expect(migration).toContain("status = 'open'::televoting.round_status");
    expect(migration).toContain("results_status = 'published'");
    expect(migration).toContain("public.v3_public_televote_round_show_visible(id)");
  });

  it("does not expose closed unpublished ballot composition", () => {
    expect(migration).toContain("round_row.id = round_entries.round_id");
    expect(migration).toContain("round_row.id = round_countries.round_id");
    expect(migration).toContain("round_row.status = 'open'::televoting.round_status");
    expect(migration).toContain("round_row.results_status = 'published'");
    expect(migration).not.toContain("round_row.status = 'closed'::televoting.round_status");
  });

  it("preserves Organizer voting.manage reads across every restricted table", () => {
    for (const table of ["rounds", "round_entries", "round_countries"]) {
      const policy = new RegExp(
        `create policy "solaris consolidated authenticated read"\\s+on televoting\\.${table}\\s+for select\\s+to authenticated\\s+using \\(([\\s\\S]*?)\\n\\);`,
      ).exec(migration)?.[1];
      expect(policy, table).toContain(
        "public.studio2_access_allowed('voting.manage', null, false)",
      );
    }
    expect(migration).toContain(
      "Organizer Televoting read capability missing after public RLS hardening",
    );
  });
});
