import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("completion product public egress contract", () => {
  const encyclopedia = source("src/routes/encyclopedia/index.tsx");
  const votingDna = source("src/routes/voting-dna/$code.tsx");
  const votingDnaProjection = source("src/lib/v3-public-voting-dna.ts");
  const archive = source("src/lib/data-live.ts");
  const queryPolicy = source("src/lib/app-query-policy.ts");
  const migration = source(
    "supabase/migrations/20260920104806_completion_products.sql",
  );

  it("does not make Encyclopedia download vote or result archives it never renders", () => {
    expect(encyclopedia).not.toContain("useAllJuryVotes");
    expect(encyclopedia).not.toContain("useAllTelevotes");
    expect(encyclopedia).not.toContain("useAllResults");
    expect(encyclopedia).toContain("useAllParticipants");
  });

  it("uses one compact publication-safe Voting DNA projection instead of shipping the full jury archive", () => {
    expect(votingDna).toContain("loadV3PublicVotingDna");
    expect(votingDna).not.toContain("useAllJuryVotes");
    expect(votingDna).not.toContain("useAllTelevotes");
    expect(votingDna).not.toContain('rpc("public_country_voting_dna"');
    expect(votingDnaProjection).toContain(
      'client.rpc("v3_public_country_voting_dna"',
    );
    expect(votingDnaProjection).toContain("const MAX_RELATIONSHIPS = 10");
    expect(votingDnaProjection).toContain("const MAX_RESULT_ROWS = 256");
    expect(votingDnaProjection).not.toContain('rpc("public_country_voting_dna"');
    expect(votingDnaProjection).not.toContain('.from("jury_votes")');
    expect(votingDnaProjection).not.toContain('.from("results")');

    // The legacy RPC remains installed for compatibility with older clients, but
    // V3 Public must never use it because generic Results publication can expose
    // split Jury/Televote totals before those exact layers are public.
    expect(migration).toContain(
      "create or replace function public.public_country_voting_dna",
    );
    expect(migration).toContain(
      "show_publication_enabled(vote.show_id, 'detailed_voting')",
    );
  });

  it("keeps generic archive hooks cached and non-realtime for older archive consumers", () => {
    expect(archive).toContain("ARCHIVE_STALE_TIME = 60 * 60 * 1000");
    expect(archive).toContain('solarisQueryPolicy("cold")');
    expect(queryPolicy).toContain("gcTime: 2 * 60 * 60 * 1000");
    expect(queryPolicy).toContain("refetchOnWindowFocus: false");
    expect(queryPolicy).toContain("refetchOnReconnect: false");
  });
});
