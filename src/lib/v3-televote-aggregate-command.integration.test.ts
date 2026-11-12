import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20261104144000_v3_televote_aggregate_command.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const authorizationRunner = fs.readFileSync(
  path.join(process.cwd(), ".github/scripts/v3-televote-aggregate-authorization-rehearsal.sh"), "utf8",
);
const authorizationWorkflow = fs.readFileSync(
  path.join(process.cwd(), ".github/workflows/v3-televote-aggregate-authorization-rehearsal.yml"), "utf8",
);


describe("V3 governed Televote aggregate totals", () => {
  it("proves anonymous denial and unprivileged edition scope on a disposable local database", () => {
    expect(authorizationWorkflow).toContain("supabase db reset --local --no-seed");
    expect(authorizationWorkflow).toContain("supabase stop --no-backup");
    expect(authorizationWorkflow).not.toContain("secrets.");
    expect(authorizationRunner).toContain("ANON_TELEVOTE_AGGREGATE_RPC_EXPOSED");
    expect(authorizationRunner).toContain("UNAUTHORIZED_TELEVOTE_SNAPSHOT_SUCCEEDED");
    expect(authorizationRunner).toContain("UNAUTHORIZED_TELEVOTE_MUTATION_SUCCEEDED");
    expect(authorizationRunner).toContain("PRIVATE_TELEVOTE_AGGREGATE_READER_EXPOSED");
    expect(authorizationRunner).toContain("Refusing hosted database");
    expect(authorizationRunner).toContain("rollback;");
  });


  it("preserves the forward S13 contract and source-controlled migration identity", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.system.televote-aggregate-command'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("20261019210000_v3_televote_aggregate_command");
  });

  it("authorizes the exact edition before exposing show membership, including NULL denials", () => {
    for (const [signature, endMarker] of [
      ["public.studio2_televote_aggregate_snapshot(", "$snapshot$;"],
      ["public.studio2_update_televote_aggregate_totals(", "$command$;"],
    ]) {
      const start = migration.indexOf("create or replace function " + signature);
      const end = migration.indexOf(endMarker, start);
      const body = migration.slice(start, end);
      const guard = body.indexOf("studio2_access_allowed('voting.manage', p_edition_id, false) is not true");
      const showLookup = body.indexOf("from public.shows show_row");
      expect(start).toBeGreaterThanOrEqual(0);
      expect(guard).toBeGreaterThan(0);
      expect(showLookup).toBeGreaterThan(guard);
      expect(body).not.toContain("if not public.studio2_access_allowed('voting.manage'");
    }
  });

  it("moves the consequential write behind an authenticated capability-checked RPC", () => {
    expect(migration).toContain("public.studio2_update_televote_aggregate_totals");
    expect(migration).toContain("public.studio2_televote_aggregate_snapshot");
    expect(migration).toContain("studio2_access_allowed('voting.manage'");
    expect(normalized).toContain(
      "revoke all on function public.studio2_update_televote_aggregate_totals",
    );
    expect(normalized).toContain("to authenticated");
  });

  it("requires both a monotonic CAS version and a compatibility state fingerprint", () => {
    expect(migration).toContain("private.studio2_televote_aggregate_versions");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("p_expected_state_hash");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("studio2_televote_aggregate_state_hash");
    expect(migration).toContain("'rawRows'");
  });

  it("claims idempotency before mutation and reconciles non-final replays", () => {
    const claim = migration.indexOf("private.studio2_claim_operation(");
    const firstVoteWrite = migration.indexOf("insert into public.televote_votes");
    expect(claim).toBeGreaterThan(-1);
    expect(firstVoteWrite).toBeGreaterThan(claim);
    expect(migration).toContain("public.studio2_reconcile_operation");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("v_claim ->> 'status' = 'succeeded'");
    expect(migration).toContain("receiptId");
  });

  it("validates show/edition scope and unambiguous participant identity before writes", () => {
    expect(migration).toContain("v_show.edition_id is distinct from p_edition_id");
    expect(migration).toContain("participant.show_id = p_show_id");
    expect(migration).toContain("participant.edition_id = p_edition_id");
    expect(migration).toContain("jsonb_array_length(v_canonical_changes) <> v_participant_count");
    expect(migration).toContain("v_seen ? v_participant_id::text");
    expect(migration).toContain("identity_count > 1");
  });

  it("preserves sanctioned negative integer totals instead of imposing a fake non-negative rule", () => {
    expect(migration).toContain("v_points_bigint < -2147483648");
    expect(migration).not.toContain("v_points < 0 then");
  });

  it("serializes with Results and blocks edits after result protection begins", () => {
    expect(migration).toContain("studio2-results:");
    expect(migration).toContain("studio2_televote_results_are_protected");
    expect(migration).toContain("operation.locked_version is not null");
    expect(migration).toContain("operation.reveal_ready_version is not null");
    expect(migration).toContain("control.state in ('scheduled', 'public')");
    expect(migration).toContain("publication_config -> 'televote_results' = 'true'::jsonb");
  });

  it("uses the canonical S4 event signature and records auditable affected identities", () => {
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'televote.aggregate_updated'");
    expect(migration).toContain("p_operation_id,\n    p_edition_id,\n    p_show_id,\n    jsonb_build_object(");
    expect(migration).toContain("'affectedParticipantIds', v_affected_ids");
    expect(migration).toContain("'beforeStateHash', v_current_hash");
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'resultsRecalculationRequired', true");
  });

  it("makes replace mode remove stale legacy/orphan rows without weakening patch mode", () => {
    expect(migration).toContain("if v_mode = 'replace' then");
    expect(migration).toContain("delete from public.televote_votes vote");
    expect(migration).toContain("and not exists (");
    expect(migration).toContain("Collapse a possible legacy country-only row");
  });

  it("keeps the aggregate mutation atomic instead of row-by-row browser authority", () => {
    expect(normalized).toContain("language plpgsql security definer");
    expect(migration).not.toContain("commit;\n\n  insert into public.televote_votes");
    expect(migration).toContain("on conflict (show_id, contest_entity_id)");
    expect(migration).toContain("on conflict (show_id, country_id)");
  });
});
