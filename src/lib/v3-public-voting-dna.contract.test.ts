import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  new URL("../routes/voting-dna/$code.tsx", import.meta.url),
  "utf8",
);
const types = readFileSync(
  new URL("./v3-public-voting-dna.ts", import.meta.url),
  "utf8",
);
const functions = readFileSync(
  new URL("./v3-voting-dna.functions.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../integrations/v3/voting-dna-source.server.ts", import.meta.url),
  "utf8",
);

describe("V3 Voting DNA publication boundary", () => {
  it("keeps Supabase access and strict projection parsing off the browser path", () => {
    expect(route).toContain("getV3PublicVotingDna");
    expect(route).not.toContain("loadV3PublicVotingDna");
    expect(route).not.toContain("supabase");

    expect(functions).toContain('createServerFn({ method: "GET" })');
    expect(functions).toContain(
      'await import(\n      "@/integrations/v3/voting-dna-source.server"',
    );
    expect(functions).not.toContain("@/integrations/supabase/client");

    expect(types).not.toContain("supabase");
    expect(types).not.toContain("parseV3PublicVotingDna");
    expect(types).not.toContain("UUID_PATTERN");
  });

  it("uses only the new publication-safe System projection with anonymous public semantics", () => {
    expect(serverSource).toContain("createConfirmationPublicRuntimeClient");
    expect(serverSource).toContain('client.rpc("v3_public_country_voting_dna"');
    expect(serverSource).toContain("p_country_id: countryId");

    expect(serverSource).not.toContain('rpc("public_country_voting_dna"');
    expect(serverSource).not.toContain('.from("results")');
    expect(serverSource).not.toContain('.from("jury_votes")');
    expect(serverSource).not.toContain("service_role");
    expect(serverSource).not.toContain("getSession");
  });

  it("fails closed instead of falling back to the legacy aggregate", () => {
    expect(serverSource).toContain(
      'throw new Error("Voting DNA projection unavailable")',
    );
    expect(route).toContain("Voting DNA is temporarily unavailable");
    expect(route).toContain("Hidden Jury or");
    expect(route).toContain(
      "Televote layers are never reconstructed from the older aggregate response.",
    );
  });

  it("requires independent Jury and Televote publication evidence", () => {
    expect(types).toContain("juryPublished: boolean");
    expect(types).toContain("juryPoints: number | null");
    expect(types).toContain("televotePublished: boolean");
    expect(types).toContain("televotePoints: number | null");
    expect(serverSource).toContain("must be null while its result layer is hidden");

    expect(route).toContain("row.result.juryPublished && row.result.juryPoints !== null");
    expect(route).toContain(
      "row.result.televotePublished && row.result.televotePoints !== null",
    );
    expect(route).toContain("Not public");
  });

  it("keeps the projection compact, unique, versioned and historically scoped", () => {
    expect(types).toContain("schemaVersion: 1");
    expect(types).toContain('formulaVersion: "v1"');
    expect(types).toContain("detailedEditionIds: string[]");
    expect(serverSource).toContain("const MAX_RELATIONSHIPS = 10");
    expect(serverSource).toContain("const MAX_RESULT_ROWS = 256");
    expect(serverSource).toContain("const MAX_DETAILED_EDITIONS = 256");
    expect(serverSource).toContain("Voting DNA detailed edition scope count mismatch");
    expect(serverSource).toContain("Voting DNA result sample count mismatch");
    expect(serverSource).toContain(
      "Voting DNA result sample contains duplicate edition identity",
    );

    expect(route).toContain("Detailed-voting scope:");
    expect(route).toContain("dna.data.sample.detailedEditionIds");
    expect(route).toContain("exact published");
    expect(route).toContain("editions listed in the sample scope above");
  });
});
