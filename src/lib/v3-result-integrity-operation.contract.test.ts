import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017104500_v3_result_integrity_recompute_operation.sql"),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/result-integrity.server.ts"),
  "utf8",
);
const functions = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/result-integrity.functions.ts"),
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("\nend\n$apply$;", start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end + "\nend\n$apply$;".length);
}

describe("System V3 governed Result Integrity recompute", () => {
  it("binds every write to the exact round-derived Solaris edition and capability", () => {
    const apply = functionBody("televoting.studio2_apply_result_integrity_recompute");
    expect(apply).toContain("private.v3_televote_solaris_edition_for_round(p_round_id)");
    expect(apply).toContain("v_resolved_edition_id is distinct from p_solaris_edition_id");
    expect(apply).toContain("studio2_access_allowed('voting.manage', p_solaris_edition_id, false)");
  });

  it("uses canonical S2 identity, semantic replay and caller correlation", () => {
    const apply = functionBody("televoting.studio2_apply_result_integrity_recompute");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("'televote.result_integrity.recompute'");
    expect(apply).toContain("coalesce(p_correlation_id, p_operation_id)");
    expect(apply).toContain("'expectedCalculationVersion', p_expected_calculation_version");
    expect(apply).toContain("'evidenceFingerprint', v_evidence_fingerprint");
    expect(apply).toContain("if coalesce((v_claim ->> 'replayed')::boolean, false) then");
    expect(apply.indexOf("v_claim := private.studio2_claim_operation(")).toBeLessThan(
      apply.indexOf("p_expected_calculation_version then"),
    );
    expect(apply).toContain("private.studio2_complete_operation");
  });

  it("rejects stale calculation identity under a serialized final write boundary", () => {
    const apply = functionBody("televoting.studio2_apply_result_integrity_recompute");
    expect(apply).toContain("pg_advisory_xact_lock");
    expect(apply).toContain("from televoting.rounds round_row");
    expect(apply).toContain("for update;");
    expect(apply).toContain("v_round.calculation_version is distinct from p_expected_calculation_version");
    expect(apply).toContain("Result Integrity calculation version changed");
    expect(apply).toContain("v_round.televote_engine_version <> 'robust-televote-v2'");
  });

  it("atomically replaces only derived cluster evidence and advances an evidence revision", () => {
    const apply = functionBody("televoting.studio2_apply_result_integrity_recompute");
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(apply).toContain("delete from televoting.round_influence_results");
    expect(apply).toContain("evidence.subject_type = 'cluster'");
    expect(apply).toContain("insert into televoting.round_influence_results");
    expect(apply).toContain("insert into televoting.round_integrity_evidence_versions");
    expect(apply).toContain("v_next_revision := coalesce(v_previous_revision, 0) + 1");
    expect(apply).toContain("'evidenceRevision', v_next_revision");
    expect(apply).toContain("'rowCount', v_evidence_count");
  });

  it("validates a bounded complete replacement before deleting current evidence", () => {
    const apply = functionBody("televoting.studio2_apply_result_integrity_recompute");
    expect(apply).toContain("jsonb_typeof(v_evidence) <> 'array'");
    expect(apply).toContain("v_evidence_count > 500");
    expect(apply).toContain("Result Integrity evidence contains duplicate cluster identities");
    expect(apply).toContain("Result Integrity member identities are invalid");
    expect(apply.indexOf("for v_item in select value from jsonb_array_elements(v_evidence)")).toBeLessThan(
      apply.indexOf("delete from televoting.round_influence_results"),
    );
  });

  it("never mutates ballots or official result values", () => {
    const apply = functionBody("televoting.studio2_apply_result_integrity_recompute");
    expect(apply).not.toContain("delete from televoting.vote_submissions");
    expect(apply).not.toContain("update televoting.vote_submissions");
    expect(apply).not.toContain("insert into televoting.vote_submissions");
    expect(apply).not.toContain("delete from televoting.round_results");
    expect(apply).not.toContain("update televoting.round_results");
    expect(apply).not.toContain("insert into televoting.round_results");
  });

  it("uses the durable operation receipt as evidence instead of inventing an orphan consequence event", () => {
    expect(migration).toContain("The durable S2 receipt is the canonical audit/reconciliation evidence");
    expect(migration).not.toContain("v3_emit_domain_event");
    expect(migration).not.toContain("televote.result_integrity_recomputed");
  });

  it("removes the old server-side delete-then-insert authority", () => {
    expect(server).toContain('televotingAdmin.rpc(\n    "studio2_apply_result_integrity_recompute"');
    expect(server).not.toContain('.from("round_influence_results")\n    .delete()');
    expect(server).not.toContain('televotingAdmin.from("round_influence_results").insert');
    expect(server).toContain("reconcileSystemOperationServer(command.operationId)");
    expect(server).toContain("reconciliation.receipt.status === \"succeeded\"");
  });

  it("exposes an exact-edition V3 envelope while keeping the legacy specialist route on the same RPC", () => {
    expect(functions).toContain("export const recomputeResultIntegrityOperation");
    for (const field of [
      "editionId",
      "roundId",
      "expectedCalculationVersion",
      "operationId",
      "idempotencyKey",
      "correlationId",
    ]) {
      expect(functions).toContain(field);
    }
    expect(functions).toContain("recomputeResultIntegrityOperationWithReplayServer(data)");
    expect(functions).toContain("export const recomputeResultIntegrity =");
    expect(server).toContain("Compatibility adapter for the pre-V3 specialist route");
    expect(server).toContain("return recomputeWithOperation({");
  });

  it("supports exact-edition read binding without forcing a legacy-route cutover", () => {
    expect(functions).toContain("editionId?: string | null");
    expect(server).toContain("getResultIntegrityServer(roundId: string, expectedEditionId?: string)");
    expect(server).toContain("identity.editionId !== expectedEditionId");
    expect(server).toContain("solarisEditionId: identity.editionId");
  });
});
