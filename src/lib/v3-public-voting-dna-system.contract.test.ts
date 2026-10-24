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

const rehearsal = readFileSync(
  resolve(
    process.cwd(),
    "scripts/rehearse-v3-public-voting-dna-publication.sh",
  ),
  "utf8",
);

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("V3 Public Voting DNA System publication boundary", () => {
  it("registers the migration through the S13 contract instead of bypassing governance", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain(
      "v3.results.public-voting-dna-publication-boundary-v1",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it("fails raw public.results reads closed until every split-result layer is public", () => {
    const anonPolicy = between(
      migration,
      'create policy "solaris consolidated anon read"',
      'drop policy if exists "solaris consolidated authenticated read"',
    );
    const authenticatedPolicy = between(
      migration,
      'create policy "solaris consolidated authenticated read"',
      "create or replace function public.v3_public_country_voting_dna(",
    );

    for (const policy of [anonPolicy, authenticatedPolicy]) {
      expect(policy).toContain("show_publication_enabled(show_id, 'results')");
      expect(policy).toContain(
        "show_publication_enabled(show_id, 'jury_results')",
      );
      expect(policy).toContain(
        "show_publication_enabled(show_id, 'televote_results')",
      );
    }

    expect(anonPolicy).toContain(
      "studio2_access_allowed('results.preview', edition_id, false)",
    );
    expect(authenticatedPolicy).toContain(
      "studio2_access_allowed('results.verify', edition_id, true)",
    );
    expect(authenticatedPolicy).toContain(
      "studio2_access_allowed('results.preview', edition_id, false)",
    );
  });

  it("keeps generic, Jury and Televote projection authority independent", () => {
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

  it("exposes a bounded caller-safe definer RPC without rewriting legacy compatibility", () => {
    expect(migration).toContain(
      "create or replace function public.v3_public_country_voting_dna(",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
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

  it("rehearses the real caller boundary on local Supabase and fails closed against hosted endpoints", () => {
    expect(rehearsal).toContain(
      'http://127.0.0.1:*|http://localhost:*) ;;',
    );
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("for role in anon authenticated; do");
    expect(rehearsal).toContain("set local role ${role};");
    expect(rehearsal).toContain("Voting DNA projection must remain SECURITY DEFINER");
    expect(rehearsal).toContain("search_path is not fixed to empty");
    expect(rehearsal).toContain(
      "can bypass the projection through raw public.results while split layers are hidden",
    );
    expect(rehearsal).toContain(
      "can read the raw Result row while Televote remains hidden",
    );
    expect(rehearsal).toContain("Jury points leaked while hidden");
    expect(rehearsal).toContain("hidden Televote points crossed the API boundary");
    expect(rehearsal).toContain(
      "did not regain raw Result compatibility after every Result layer became public",
    );
    expect(rehearsal).toContain(
      "Hiding generic Results must remove both bounded and raw Result evidence even if split flags remain true",
    );
  });
});
