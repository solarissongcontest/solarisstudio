import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Taste DNA contract", () => {
  it("classifies Taste DNA as a building redesign with a personal-preference acceptance contract", () => {
    const registry = source("src/lib/v3-public-capability-supplements.ts");
    const tasteStart = registry.indexOf('id: "taste-dna"');
    const recordsStart = registry.indexOf('id: "records"', tasteStart);
    const taste = registry.slice(tasteStart, recordsStart);

    expect(tasteStart).toBeGreaterThan(-1);
    expect(taste).toContain('classification: "redesign"');
    expect(taste).toContain('specificationStatus: "building"');
    expect(taste).toContain('acceptanceScenarioId: "public.taste-dna-personal-preference-profile"');
    expect(taste).toContain("private caller-owned fan_taste_ballots");
  });

  it("keeps Taste DNA private preference authority separate from Country Voting DNA", () => {
    const tasteData = source("src/lib/taste-data.ts");
    const votingDna = source("src/routes/voting-dna/$code.tsx");

    expect(tasteData).toContain('.from("fan_taste_ballots")');
    expect(tasteData).not.toContain("public_country_voting_dna");
    expect(votingDna).toContain('rpc("public_country_voting_dna"');
    expect(votingDna).not.toContain("fan_taste_ballots");
  });

  it("retains server-side ownership and ranking validation for saved Taste DNA ballots", () => {
    const migration = source("supabase/migrations/20260817203915_restore_taste_dna_beta_runtime.sql");

    expect(migration).toContain("validate_fan_taste_ballot");
    expect(migration).toContain("new.profile_id <> auth.uid()");
    expect(migration).toContain("Taste ballot owner does not match the signed-in user");
    expect(migration).toContain("Taste ranking contains duplicate entries");
    expect(migration).toContain("Taste ranking contains an entry that does not belong to this show");
    expect(migration).toContain("using (profile_id = auth.uid())");
    expect(migration).toContain("with check (profile_id = auth.uid())");
  });

  it("does not introduce browser persistence or Supabase I/O in the V3 projection layer", () => {
    const projection = source("src/lib/v3-taste-dna.ts");

    expect(projection).not.toContain("localStorage");
    expect(projection).not.toContain("sessionStorage");
    expect(projection).not.toContain("@/integrations/supabase");
    expect(projection).not.toContain(".rpc(");
    expect(projection).not.toContain(".from(");
  });

  it("cuts over only the installed-app V3 rollout and preserves the legacy route as fallback", () => {
    const route = source("src/routes/taste-dna.tsx");
    const legacy = source("src/routes/taste-dna/index.tsx");

    expect(route).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("<V3TasteDnaScreen />");
    expect(route).toContain("return <Outlet />;");
    expect(route).not.toContain("@/integrations/supabase");
    expect(legacy).toContain("function TasteDnaPage()");
  });

  it("documents methodology and the explicit Voting DNA boundary before parity", () => {
    const contract = source("docs/v3-public-p21-taste-dna-contract.md");

    expect(contract).toContain("## Relationship with Voting DNA");
    expect(contract).toContain("**Subject:** a person/user.");
    expect(contract).toContain("**Subject:** a contest country/delegation as a public historical voting entity.");
    expect(contract).toContain("public_country_voting_dna(uuid)");
    expect(contract).toContain("## Acceptance scenarios");
  });
});
