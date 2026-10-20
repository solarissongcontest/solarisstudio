import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const registry = readFileSync(
  resolve(process.cwd(), "src/lib/v3-public-capability-supplements.ts"),
  "utf8",
);
const contract = readFileSync(
  resolve(process.cwd(), "docs/v3-public-p21-taste-dna-contract.md"),
  "utf8",
);

function tasteDnaRegistryEntry() {
  const start = registry.indexOf('id: "taste-dna"');
  const end = registry.indexOf('\n  {', start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  return registry.slice(start, end === -1 ? registry.length : end);
}

describe("Public V3 P21 Taste DNA registry", () => {
  it("records the audited capability as an active redesign rather than an unresolved discovery", () => {
    const source = tasteDnaRegistryEntry();
    expect(source).toContain('classification: "redesign"');
    expect(source).toContain('specificationStatus: "building"');
    expect(source).toContain('acceptanceScenarioId: "public.taste-dna-private-preference"');
  });

  it("includes anonymous ephemeral analysis without weakening authenticated private persistence", () => {
    const source = tasteDnaRegistryEntry();
    expect(source).toContain("personas: ALL_PUBLIC_PERSONAS");
    expect(source).toContain('authRequirement: "optional"');
    expect(contract).toContain("anonymous visitor: can build an in-memory ranking");
    expect(contract).toContain("SELECT, INSERT, UPDATE and DELETE policies restrict rows to `profile_id = auth.uid()`");
  });

  it("keeps personal Taste DNA separate from public Country Voting DNA", () => {
    const source = tasteDnaRegistryEntry();
    expect(source).toContain("Country Voting DNA remains separate public country-pattern analysis");
    expect(contract).toContain("Taste DNA and Voting DNA must remain separate capabilities");
    expect(contract).toContain("It does not read or expose a fan's private Taste DNA ballots");
  });

  it("does not overclaim parity before exact-head acceptance evidence", () => {
    const source = tasteDnaRegistryEntry();
    expect(source).not.toContain('specificationStatus: "parity"');
    expect(source).toContain("Parity still requires exact-head acceptance evidence");
  });
});
