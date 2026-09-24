import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("completion product public egress contract", () => {
  const encyclopedia = source("src/routes/encyclopedia/index.tsx");
  const votingDna = source("src/routes/voting-dna/$code.tsx");
  const archive = source("src/lib/data-live.ts");
  const migration = source(
    "supabase/migrations/20260920104806_completion_products.sql",
  );

  it("does not make Encyclopedia download vote or result archives it never renders", () => {
    expect(encyclopedia).not.toContain("useAllJuryVotes");
    expect(encyclopedia).not.toContain("useAllTelevotes");
    expect(encyclopedia).not.toContain("useAllResults");
    expect(encyclopedia).toContain("useAllParticipants");
  });

  it("uses one compact Voting DNA aggregate instead of shipping the full jury archive", () => {
    expect(votingDna).toContain('rpc("public_country_voting_dna"');
    expect(votingDna).not.toContain("useAllJuryVotes");
    expect(votingDna).not.toContain("useAllTelevotes");
    expect(migration).toContain(
      "create or replace function public.public_country_voting_dna",
    );
    expect(migration).toContain(
      "show_publication_enabled(vote.show_id, 'detailed_voting')",
    );
  });

  it("keeps generic archive hooks cached and non-realtime for older archive consumers", () => {
    expect(archive).toContain("ARCHIVE_STALE_TIME = 60 * 60 * 1000");
    expect(archive).toContain("gcTime: 2 * 60 * 60 * 1000");
    expect(archive).toContain("refetchOnWindowFocus: false");
    expect(archive).toContain("refetchOnReconnect: false");
  });
});
