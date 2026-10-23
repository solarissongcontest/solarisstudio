import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../routes/voting-dna/$code.tsx", import.meta.url),
  "utf8",
);
const adapter = readFileSync(
  new URL("./v3-public-voting-dna.ts", import.meta.url),
  "utf8",
);

describe("V3 Voting DNA publication boundary", () => {
  it("uses only the new publication-safe System projection", () => {
    expect(route).toContain("loadV3PublicVotingDna");
    expect(adapter).toContain('client.rpc("v3_public_country_voting_dna"');
    expect(adapter).toContain("p_country_id: countryId");

    expect(route).not.toContain("public_country_voting_dna");
    expect(route).not.toContain("supabase");
    expect(adapter).not.toContain('rpc("public_country_voting_dna"');
    expect(adapter).not.toContain('.from("results")');
    expect(adapter).not.toContain('.from("jury_votes")');
  });

  it("fails closed instead of falling back to the legacy aggregate", () => {
    expect(adapter).toContain('throw new Error("Voting DNA projection unavailable")');
    expect(route).toContain("Voting DNA is temporarily unavailable");
    expect(route).toContain("Hidden Jury or");
    expect(route).toContain(
      "Televote layers are never reconstructed from the older aggregate response.",
    );
  });

  it("requires independent Jury and Televote publication evidence", () => {
    expect(adapter).toContain("juryPublished: boolean");
    expect(adapter).toContain("juryPoints: number | null");
    expect(adapter).toContain("televotePublished: boolean");
    expect(adapter).toContain("televotePoints: number | null");
    expect(adapter).toContain("must be null while its result layer is hidden");

    expect(route).toContain("row.result.juryPublished && row.result.juryPoints !== null");
    expect(route).toContain(
      "row.result.televotePublished && row.result.televotePoints !== null",
    );
    expect(route).toContain("Not public");
  });

  it("keeps the projection compact, unique and versioned", () => {
    expect(adapter).toContain("schemaVersion: 1");
    expect(adapter).toContain('formulaVersion: "v1"');
    expect(adapter).toContain("const MAX_RELATIONSHIPS = 10");
    expect(adapter).toContain("const MAX_RESULT_ROWS = 256");
    expect(adapter).toContain("Voting DNA result sample count mismatch");
    expect(adapter).toContain("Voting DNA result sample contains duplicate edition identity");
  });
});
