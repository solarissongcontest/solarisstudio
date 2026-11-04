import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261104120000_v3_public_voting_dna_publication_boundary.sql",
  ),
  "utf8",
);

const rehearsalRunner = resolve(process.cwd(), "scripts/rehearse-v3-public-voting-dna-publication.sh");

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-public-voting-dna-publication-rehearsal.yml"),
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
  it("proves both isolated clean replay and production-shaped upgrade without hosted endpoints", () => {
    expect(workflow).toContain("matrix:");
    expect(workflow).toContain("mode: [clean-replay, current-main-upgrade]");
    expect(workflow).toContain("github.event.pull_request.head.sha");
    expect(workflow).toContain("github.event.pull_request.base.sha");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).toContain('bash "$feature_root/scripts/rehearse-v3-public-voting-dna-publication.sh"');
    expect(workflow).toContain("supabase stop --no-backup");
    expect(workflow).not.toContain("secrets.");
  });

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
      'drop policy if exists "solaris consolidated anon read" on public.jury_votes;',
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

    // Anonymous callers cannot take the Organizer preview path, even if
    // future capability resolution accidentally changes its anon behavior.
    expect(anonPolicy).not.toContain("studio2_access_allowed");
    expect(authenticatedPolicy).toContain(
      "studio2_access_allowed('results.preview', edition_id, false)",
    );
    expect(authenticatedPolicy).toContain(
      "studio2_access_allowed('results.verify', edition_id, true)",
    );
    expect(authenticatedPolicy).toContain(
      "studio2_access_allowed('results.preview', edition_id, false)",
    );
  });

  it("refuses cross-edition Jury data even when the referenced show publishes detailed voting", () => {
    // The historical Jury table has separate FKs for edition and show, so the
    // public SECURITY DEFINER projection must enforce their relationship.
    const detailedVotes = between(
      migration,
      "with detailed_votes as (",
      "  detailed_scope as (",
    );
    expect(detailedVotes).toContain("from public.jury_votes vote");
    expect(detailedVotes).toMatch(
      /join public\.shows vote_show\s+on vote_show\.id = vote\.show_id\s+and vote_show\.edition_id = vote\.edition_id/,
    );
    expect(detailedVotes).toContain(
      "show_publication_enabled(vote.show_id, 'detailed_voting')",
    );
    expect(detailedVotes).toContain("edition.published = true");
    // Scope BEFORE relationship aggregation, not only after large global joins.
    expect(detailedVotes).toContain(
      "coalesce(vote.voter_country_id, voter_entity.country_id) = p_country_id",
    );
    expect(detailedVotes).toContain(
      "coalesce(vote.receiving_country_id, receiving_entity.country_id) = p_country_id",
    );
  });

  it("does not expose unbound or wrong-edition raw Jury votes through public API policies", () => {
    const anon = between(
      migration,
      'drop policy if exists "solaris consolidated anon read" on public.jury_votes;',
      'drop policy if exists "solaris consolidated authenticated read" on public.jury_votes;',
    );
    const authenticated = between(
      migration,
      'drop policy if exists "solaris consolidated authenticated read" on public.jury_votes;',
      "create or replace function public.v3_public_country_voting_dna(",
    );
    for (const policy of [anon, authenticated]) {
      expect(policy).toContain("on public.jury_votes");
      expect(policy).toContain("show_id is not null");
      expect(policy).toContain("jury_show.id = jury_votes.show_id");
      expect(policy).toContain("jury_show.edition_id = jury_votes.edition_id");
      expect(policy).toContain("show_publication_enabled(jury_show.id, 'detailed_voting')");
      expect(policy).not.toContain("edition.published = true");
    }
    expect(anon).not.toContain("studio2_access_allowed");
    expect(authenticated).toContain(
      "studio2_access_allowed('jury.ballots.read', edition_id, false)",
    );
    expect(authenticated).toContain(
      "studio2_access_allowed('jury.ballots.manage', edition_id, true)",
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

  it("exercises real anonymous/authenticated Jury table policy on disposable fixtures", () => {
    expect(rehearsal).toContain("Rehearsing raw Jury anonymity and show-less history");
    expect(rehearsal).toContain("insert into public.jury_votes");
    expect(rehearsal).toContain("set local role anon;");
    expect(rehearsal).toContain("set local role authenticated;");
    expect(rehearsal).toContain("anon_private=0");
    expect(rehearsal).toContain("auth_private=0");
    expect(rehearsal).toContain("anon_published=1");
    expect(rehearsal).toContain("anon_showless=0");
    expect(rehearsal).toContain("auth_published=1");
    expect(rehearsal).toContain("auth_showless=0");
    expect(rehearsal).toContain("rollback;");
  });

  it("rehearses the real caller boundary on local Supabase and fails closed against hosted endpoints", () => {
    expect(rehearsal).toContain("local_api_pattern='^http://(127[.]0[.]0[.]1|localhost):[0-9]+$'");
    expect(rehearsal).toContain("local_db_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'");
    expect(rehearsal.match(/COUNTRY_ID='/g)).toHaveLength(1);
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
  it.each([
    ["http://localhost:54321", "postgresql://postgres:postgres@hosted.invalid:54322/postgres"],
    ["http://localhost:54321", "postgresql://postgres:postgres@localhost:54322@hosted.invalid/postgres"],
    ["http://localhost:54321", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=hosted.invalid"],
    ["http://localhost:54321", "postgresql://postgres:postgres@localhost:54322/otherdb"],
    ["http://localhost:54321@hosted.invalid", "postgresql://postgres:postgres@localhost:54322/postgres"],
    ["https://localhost:54321", "postgresql://postgres:postgres@localhost:54322/postgres"],
  ])("rejects deceptive or hosted rehearsal routing before any SQL: %s, %s", (apiUrl, databaseUrl) => {
    const root = mkdtempSync(join(tmpdir(), "solaris-voting-dna-isolation-"));
    try {
      writeFileSync(join(root, "supabase"),
        `#!/bin/sh\nprintf '%s\\n' 'API_URL=${apiUrl}' 'DB_URL=${databaseUrl}'\n`,
        { mode: 0o755 });
      writeFileSync(join(root, "psql"), "#!/bin/sh\\necho MOCK_PSQL_STARTED >&2\\nexit 9\\n".replaceAll("\\n", "\n"), { mode: 0o755 });
      const result = spawnSync("bash", [rehearsalRunner], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Refusing");
      expect(result.stderr).not.toContain("MOCK_PSQL_STARTED");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["http://127.0.0.1:54321", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
    ["http://localhost:54321", "postgres://postgres:postgres@localhost:54322/postgres"],
  ])("accepts precisely local routing and reaches the isolated SQL client: %s, %s", (apiUrl, databaseUrl) => {
    const root = mkdtempSync(join(tmpdir(), "solaris-voting-dna-local-"));
    try {
      writeFileSync(join(root, "supabase"),
        `#!/bin/sh\nprintf '%s\\n' 'API_URL=${apiUrl}' 'DB_URL=${databaseUrl}'\n`,
        { mode: 0o755 });
      writeFileSync(join(root, "psql"), "#!/bin/sh\\necho MOCK_PSQL_STARTED >&2\\nexit 9\\n".replaceAll("\\n", "\n"), { mode: 0o755 });
      const result = spawnSync("bash", [rehearsalRunner], {
        env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("MOCK_PSQL_STARTED");
      expect(result.stderr).not.toContain("Refusing hosted Supabase rehearsal");
      expect(result.stderr).not.toContain("Refusing non-local database rehearsal");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

});
