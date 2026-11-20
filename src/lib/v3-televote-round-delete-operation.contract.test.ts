import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024210000_v3_televote_round_delete_operation.sql",
  ),
  "utf8",
);
const server = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/rounds.server.ts"),
  "utf8",
);
const functions = readFileSync(
  resolve(process.cwd(), "src/integrations/televoting/rounds.functions.ts"),
  "utf8",
);

describe("V3 governed Televote draft-round deletion", () => {
  it("registers an additive S13 forward-fix migration", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain("'v3.televote.round-delete-operation'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop column");
  });

  it("previews exact canonical scope, versions, consequences and blockers", () => {
    expect(migration).toContain("televoting.studio2_round_delete_preview");
    expect(migration).toContain("public.televoting_round_bindings");
    expect(migration).toContain("binding.remote_edition_id is distinct from v_round.edition_id::text");
    expect(migration).toContain("'voting.manage'");
    expect(migration).toContain("'expectedGlobalVersion', v_global_version");
    expect(migration).toContain("'expectedRoundVersion', v_round_version");
    expect(migration).toContain("'affected', jsonb_build_object(");
    expect(migration).toContain("'blockers', v_blockers");
    expect(migration).toContain("'canDelete', jsonb_array_length(v_blockers) = 0");
  });

  it("protects ballot and result history instead of trusting draft status alone", () => {
    expect(migration).toContain("from televoting.vote_submissions submission");
    expect(migration).toContain("Voting rounds with ballot history cannot be deleted");
    expect(migration).toContain("coalesce(v_round.calculation_version, 0) > 0");
    expect(migration).toContain("v_round.results_status <> 'draft'");
    expect(migration).toContain("Voting rounds with calculated or non-draft result state cannot be deleted");
  });

  it("can recover exact edition scope from a prior receipt after the round is gone", () => {
    const receiptLookup = migration.indexOf("from public.studio2_operation_receipts receipt");
    const currentRoundLookup = migration.indexOf(
      "from televoting.rounds r\n    where r.id = p_round_id;",
      receiptLookup,
    );
    const claim = migration.indexOf("v_claim := private.studio2_claim_operation(", receiptLookup);

    expect(receiptLookup).toBeGreaterThan(-1);
    expect(currentRoundLookup).toBeGreaterThan(receiptLookup);
    expect(claim).toBeGreaterThan(currentRoundLookup);
    expect(migration).toContain("receipt.command = 'televote.round.delete'");
    expect(migration).toContain("receipt.idempotency_key = v_key");
    expect(migration).toContain("v_existing_scope ->> 'solarisEditionId'");
  });

  it("claims semantic idempotency before mutable CAS validation", () => {
    const claim = migration.indexOf("v_claim := private.studio2_claim_operation(");
    const advisoryLock = migration.indexOf("pg_advisory_xact_lock(", claim);
    const cas = migration.indexOf("p_expected_global_version <> v_current_global", advisoryLock);

    expect(claim).toBeGreaterThan(-1);
    expect(advisoryLock).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(advisoryLock);
    expect(migration).toContain("'televote.round.delete'");
    expect(migration).toContain("'expectedGlobalVersion', p_expected_global_version");
    expect(migration).toContain("'expectedRoundVersion', p_expected_round_version");
    expect(migration).toContain("return v_claim -> 'result'");
  });

  it("revalidates exact round, binding, edition link and versions under lock", () => {
    expect(migration).toContain("where r.id = p_round_id\n  for update;");
    expect(migration).toContain("where binding.remote_round_id = p_round_id::text\n  for update;");
    expect(migration).toContain("v_binding.edition_id is distinct from v_solaris_edition_id");
    expect(migration).toContain("v_linked_edition_id is distinct from v_solaris_edition_id");
    expect(migration).toContain("p_expected_global_version <> v_current_global");
    expect(migration).toContain("p_expected_round_version <> v_current_round");
    expect(migration).toContain("using errcode = 'PT409'");
  });

  it("deletes the binding and draft round atomically and returns durable audit/receipt evidence", () => {
    const bindingDelete = migration.indexOf("delete from public.televoting_round_bindings binding");
    const roundDelete = migration.indexOf("delete from televoting.rounds r", bindingDelete);
    const audit = migration.indexOf("insert into televoting.admin_audit_log", roundDelete);
    const completion = migration.indexOf("private.studio2_complete_operation(v_operation_id, v_result)", audit);

    expect(bindingDelete).toBeGreaterThan(-1);
    expect(roundDelete).toBeGreaterThan(bindingDelete);
    expect(audit).toBeGreaterThan(roundDelete);
    expect(completion).toBeGreaterThan(audit);
    expect(migration).toContain("'previousGlobalVersion', v_current_global");
    expect(migration).toContain("'globalVersion', v_next_global");
    expect(migration).toContain("'previousRoundVersion', v_current_round");
    expect(migration).toContain("'roundVersion', null");
  });

  it("exposes a typed preview/apply consumer contract without silently changing Organizer ownership", () => {
    expect(functions).toContain("export type MergedRoundDeletePreview");
    expect(functions).toContain("export type MergedRoundDeleteReceipt");
    expect(functions).toContain("previewMergedTelevotingRoundDelete");
    expect(functions).toContain("applyMergedTelevotingRoundDelete");
    expect(server).toContain("previewMergedTelevotingRoundDeleteServer");
    expect(server).toContain("studio2_round_delete_preview");
    expect(server).toContain("applyMergedTelevotingRoundDeleteServer");
    expect(server).toContain("studio2_apply_round_delete");

    // Chat 3 still owns the explicit reviewed UI cutover. Keeping the old entry
    // point visible here makes that remaining dependency impossible to mistake
    // for a completed migration.
    expect(functions).toContain("export const deleteMergedTelevotingRound");
    expect(server).toContain("Compatibility path retained until the Organizer rounds surface");
  });
});
