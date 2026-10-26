import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES } from "./v3-public-capability-supplements";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const tasteDna = () => {
  const capability = V3_PUBLIC_ROUTE_DISCOVERED_CAPABILITIES.find(
    (item) => item.id === "taste-dna",
  );
  if (!capability) throw new Error("Missing Taste DNA Public capability");
  return capability;
};
const migrationEvidenceOf = () => {
  const capability = tasteDna();
  expect("migrationEvidence" in capability).toBe(true);
  if (!("migrationEvidence" in capability)) {
    throw new Error("Taste DNA has no migration evidence");
  }
  return capability.migrationEvidence;
};

describe("Public V3 Taste DNA ownership", () => {
  it("owns saved Taste DNA state in personal-preference rather than Results or Country Voting DNA", () => {
    const capability = tasteDna();
    const evidence = migrationEvidenceOf();
    const route = read("src/routes/taste-dna/index.tsx");
    const data = read("src/lib/taste-data.ts");
    const migration = read(
      "supabase/migrations/20260817203915_restore_taste_dna_beta_runtime.sql",
    );
    const physicalAudit = read("src/lib/v3-system-physical-audit.ts");
    const domainRegistry = read("src/lib/solaris-v6-domain-registry.ts");
    const votingDna = read("src/routes/voting-dna/index.tsx");
    const completionProducts = read("docs/products/completion-products.md");

    expect(capability.backendOwners).toEqual(["personal-preference", "results"]);
    expect(capability.authRequirement).toBe("optional");
    expect(capability.specificationStatus).toBe("mapped");
    expect(evidence).toContain("src/lib/v3-taste-dna-ownership.contract.test.ts");

    expect(route).toContain("useFanSession");
    expect(route).toContain("useTasteBallots");
    expect(route).toContain("useSaveTasteBallot");
    expect(route).toContain("Saved ballots are private to your account.");
    expect(data).toContain('.from("fan_taste_ballots")');
    expect(data).not.toContain('.from("results")');
    expect(data).not.toContain('.from("jury_votes")');

    expect(physicalAudit).toMatch(
      /"personal-preference":\s*\[\s*"public\.fan_follows",\s*"public\.fan_taste_ballots"/s,
    );
    expect(domainRegistry).toContain('id: "personal-preference"');
    expect(domainRegistry).toContain(
      'canonicalWriteModel: "authenticated user preference state"',
    );
    expect(domainRegistry).toContain(
      "Private preferences remain user-owned and are never promoted into Organizer authority.",
    );

    for (const policy of ["read", "insert", "update", "delete"]) {
      expect(migration).toContain(`Fans can ${policy} own taste ballots`);
    }
    expect(migration).toContain("profile_id = auth.uid()");
    expect(migration).toContain(
      "Taste ballot owner does not match the signed-in user",
    );

    expect(votingDna).toContain('title: "Country Voting DNA — Solaris Studio"');
    expect(votingDna).toContain("published jury relationships and jury/televote result profile");
    expect(votingDna).not.toContain("fan_taste_ballots");
    expect(votingDna).not.toContain("useTasteBallots");
    expect(completionProducts).toContain("## Country Voting DNA");
    expect(completionProducts).toContain("Routes: `/voting-dna`, `/voting-dna/$code`");
    expect(completionProducts).toContain("Descriptive country analytics");
  });

  it("keeps Results and Jury as analytical inputs rather than Taste DNA write authority", () => {
    const route = read("src/routes/taste-dna/index.tsx");
    const model = read("src/lib/taste-dna.ts");

    expect(route).toContain("useResults(showId || undefined)");
    expect(route).toContain("useJuryVotes(showId || undefined)");
    expect(route).toContain("resolveShowPublication(show)");
    expect(route).toContain("publication.results");
    expect(route).toContain("publication.jury_results");
    expect(route).toContain("publication.televote_results");
    expect(route).toContain("buildTasteDna");
    expect(model).toContain("jurySimilarity");
    expect(model).toContain("televoteSimilarity");
    expect(model).toContain("overallSimilarity");
    expect(model).not.toContain("supabase");
    expect(model).not.toContain("createServerFn");
  });

  it("does not claim cutover while Taste DNA still consumes mutable public Results rows", () => {
    const capability = tasteDna();
    const evidence = migrationEvidenceOf();
    const route = read("src/routes/taste-dna/index.tsx");
    const legacyData = read("src/lib/data.ts");

    expect(capability.specificationStatus).not.toBe("cutover");
    expect(evidence).toContain("v3_public_published_result_snapshot");
    expect(evidence).toContain("Public consumer gap");
    expect(route).toContain("useResults(showId || undefined)");
    expect(legacyData).toMatch(/all<ResultRow>\(\s*"results"/s);
  });
});
