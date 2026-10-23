import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024001000_v3_public_voting_dna_publication_boundary.sql",
  ),
  "utf8",
);

describe("V3 Public Voting DNA System publication boundary", () => {
  it("registers the migration through the S13 contract instead of bypassing governance", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain(
      "v3.results.public-voting-dna-publication-boundary-v1",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it("keeps generic, Jury and Televote publication authority independent", () => {
    expect(migration).toContain(
      "show_publication_enabled(result.show_id, 'results')",
    );
    expect(migration).toContain(
      "show_publication_enabled(result.show_id, 'jury_results')",
    );
    expect(migration).toContain(
      "show_publication_enabled(result.show_id, 'televote_results')",
    );
    expect(migration).toContain("'juryPublished', selected_results.jury_published");
    expect(migration).toContain(
      "'televotePublished', selected_results.televote_published",
    );
    expect(migration).toContain(
      "when selected_results.jury_published then selected_results.jury_points",
    );
    expect(migration).toContain(
      "when selected_results.televote_published then selected_results.televote_points",
    );
  });

  it("exposes a bounded caller-safe V3 RPC without rewriting legacy compatibility", () => {
    expect(migration).toContain(
      "create or replace function public.v3_public_country_voting_dna(",
    );
    expect(migration).toContain("security invoker");
    expect(migration).toContain("limit 10");
    expect(migration).toContain("'schemaVersion', 1");
    expect(migration).toContain("'formulaVersion', 'v1'");
    expect(migration).toContain("'detailedEditionIds'");
    expect(migration).toContain(
      "grant execute on function public.v3_public_country_voting_dna(uuid) to anon, authenticated, service_role",
    );
    expect(migration).not.toContain(
      "create or replace function public.public_country_voting_dna(",
    );
  });
});
