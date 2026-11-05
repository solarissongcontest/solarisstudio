import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261105140500_v3_televote_influence_role_runtime_access.sql"), "utf8");
const materializer = readFileSync(resolve(process.cwd(), "scripts/v3-s14-materialize-televote-results.ts"), "utf8");

describe("S14 robust influence materialization and least-privilege service access", () => {
  it("keeps the authenticated capability policy and preserves anonymous denial", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table televoting.round_influence_results from public, anon");
    expect(migration).toContain("grant select, insert, delete");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("Existing Organizer privilege unexpectedly absent");
    expect(migration).toContain("Organizer voting.manage RLS policy is missing");
    expect(migration).not.toContain("disable row level security");
  });

  it("retains canonical Results verification and materializes V2 counterfactual evidence", () => {
    expect(materializer).toContain("analyseRobustInfluence");
    expect(materializer).toContain('from("round_influence_results").delete()');
    expect(materializer).toContain('from("round_influence_results").insert(influenceRows)');
    expect(materializer).toContain("studio2_televote_projection_status");
    expect(materializer).toContain("canonical Televote projection provenance mismatch");
    expect(materializer).toContain('from("televote_votes")');
    expect(materializer).not.toMatch(/from\("televote_votes"\)\.(?:insert|update|delete|upsert)\(/);
  });
});
