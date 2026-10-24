import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261017104600_v3_result_integrity_replay_lookup.sql",
);
const replayServer = source(
  "src/integrations/televoting/result-integrity-replay.server.ts",
);
const functions = source(
  "src/integrations/televoting/result-integrity.functions.ts",
);

describe("System V3 Result Integrity lost-response replay gate", () => {
  it("is actor-scoped, exact-command scoped and still requires voting.manage", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("studio2_access_allowed('voting.manage', p_solaris_edition_id, false)");
    expect(migration).toContain("receipt.operation_id = p_operation_id");
    expect(migration).toContain("receipt.actor_id = v_actor");
    expect(migration).toContain("receipt.command = 'televote.result_integrity.recompute'");
    expect(migration).toContain("receipt.idempotency_key = v_key");
    expect(migration).toContain("v_receipt.risk_class is distinct from 'R2'");
  });

  it("validates stable request scope and durable result identity before replaying", () => {
    expect(migration).toContain("v_receipt.scope is distinct from v_scope");
    expect(migration).toContain("'solarisEditionId', p_solaris_edition_id");
    expect(migration).toContain("'roundId', p_round_id");
    expect(migration).toContain("v_result ->> 'operationId' is distinct from v_receipt.operation_id::text");
    expect(migration).toContain("v_result ->> 'solarisEditionId' is distinct from p_solaris_edition_id::text");
    expect(migration).toContain("v_result ->> 'roundId' is distinct from p_round_id::text");
    expect(migration).toContain("v_result ->> 'calculationVersion' is distinct from p_expected_calculation_version::text");
    expect(migration).toContain("message = 'IDEMPOTENCY_CONFLICT'");
  });

  it("does not inspect mutable voting state or create a second operation", () => {
    expect(migration).not.toContain("from televoting.rounds");
    expect(migration).not.toContain("update televoting.rounds");
    expect(migration).not.toContain("studio2_claim_operation");
    expect(migration).not.toContain("insert into public.studio2_operation_receipts");
    expect(migration).toContain("language plpgsql\nstable\nsecurity definer");
    expect(migration).toContain("return jsonb_build_object('found', false)");
  });

  it("returns only the safe reconciliation envelope, not private receipt internals", () => {
    expect(migration).toContain("'found', true");
    expect(migration).toContain("'operationId', v_receipt.operation_id");
    expect(migration).toContain("'correlationId', v_receipt.correlation_id");
    expect(migration).toContain("'status', v_receipt.status");
    expect(migration).toContain("'result', v_receipt.result");
    expect(migration).not.toContain("'requestFingerprint'");
    expect(migration).not.toContain("'idempotencyKey'");
    expect(migration).not.toContain("'scope', v_receipt.scope");
  });

  it("consults the durable replay receipt before invoking mutable recomputation", () => {
    const lookup = replayServer.indexOf("await lookupResultIntegrityReplay(command)");
    const recompute = replayServer.indexOf("return recomputeResultIntegrityOperationServer(command)");
    expect(lookup).toBeGreaterThanOrEqual(0);
    expect(recompute).toBeGreaterThan(lookup);
    expect(replayServer).toContain('"studio2_replay_result_integrity_recompute"');
    expect(replayServer).toContain("clustersAnalysed: replay.rowCount");
    expect(replayServer).toContain("currentGroups: []");
    expect(replayServer).toContain("reconciled: true");
  });

  it("routes only the caller-owned V3 operation through the replay boundary", () => {
    expect(functions).toContain(
      '"@/integrations/televoting/result-integrity-replay.server"',
    );
    expect(functions).toContain("recomputeResultIntegrityOperationWithReplayServer(data)");
    expect(functions).toContain(
      '"@/integrations/televoting/result-integrity.server"',
    );
    expect(functions).toContain("recomputeResultIntegrityServer(data.roundId)");
  });
});
