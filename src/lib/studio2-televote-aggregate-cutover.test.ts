import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = read("src/routes/_authenticated/admin/televote/$slug.tsx");
const client = read("src/lib/studio2-televote-aggregate.ts");
const migration = read("supabase/migrations/20261027195000_v3_s16_televote_aggregate_authority.sql");

describe("S16 Televote aggregate authority cutover", () => {
  test("removes the sequential browser writer", () => {
    expect(route).not.toContain('from("televote_votes")');
    expect(route).not.toContain("compatibility writer is sequential");
    expect(route).not.toMatch(/\.update\(\{\s*points:/);
    expect(route).not.toMatch(/\.insert\(\{[\s\S]{0,300}televote_votes/);
    expect(route).toContain("getTelevoteAggregateSnapshot");
    expect(route).toContain("applyTelevoteAggregateCommand");
  });

  test("binds review to canonical revision and fingerprint", () => {
    expect(route).toContain("snapshot.totals.map");
    expect(route).toContain("pendingReview.snapshot.version");
    expect(client).toContain("p_expected_version: input.snapshot.version");
    expect(client).toContain("p_expected_state_hash: input.snapshot.stateHash");
    expect(migration).toContain("VERSION_CONFLICT");
  });

  test("uses one stable operation identity and reconciles uncertain outcomes", () => {
    expect(client).toContain('command: "televote.aggregate.update"');
    expect(client).toContain("createSystemCommand");
    expect(client).toContain("p_operation_id: input.operationId");
    expect(client).toContain("p_idempotency_key: input.idempotencyKey");
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain('receipt.status === "succeeded"');
    expect(client).toContain('receipt.status === "processing" || receipt.status === "uncertain"');
  });

  test("preserves signed sanction totals and exact participant identity", () => {
    expect(route).toContain("Negative totals are allowed for sanctions or point deductions");
    expect(route).toContain("participantId: participant.id");
    expect(route).not.toContain("Math.max(0");
    expect(migration).toContain("v_points_bigint < -2147483648");
  });

  test("fails closed at the Results/source-managed boundary", () => {
    expect(route).toContain("These Televote totals are protected by the Results lifecycle");
    expect(route).toContain("Use the Results correction/republication lifecycle");
    expect(route).toContain("disabled={busy || !changes.length || publishedResults}");
    expect(migration).toContain("private.v3_televote_result_projection_sources");
    expect(migration).toContain("RESULTS_OWNED");
    expect(migration).toContain("resultsRecalculationBoundary");
    expect(migration).not.toContain("v3_recalculate_results");
  });

  test("governs the whole batch with voting.manage and S13 adoption", () => {
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261027195000_v3_s16_televote_aggregate_authority");
    expect(migration).toContain("from public, anon, service_role;");
  });
});
