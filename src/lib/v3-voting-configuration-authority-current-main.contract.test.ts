import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261024235500_v3_voting_configuration_authority_current_main.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");

function block(start: string, end?: string) {
  const from = migration.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = end ? migration.indexOf(end, from + start.length) : migration.length;
  if (end) expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 current-main Voting configuration authority", () => {
  it("uses one semantic S13 contract and canonical domain vocabulary", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.voting.configuration-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("'20261019231500_v3_versioned_voting_config'");
    expect(migration).not.toContain("'20261019231600_v3_voting_config_preflight_risk_closure'");
    expect(migration).toContain("'voting.configure'");
    expect(migration).toContain("'voting.configuration_changed'");
  });

  it("keeps shows.voting_config as the one stored config truth and versions every change", () => {
    expect(migration).toContain("private.v3_voting_config_versions");
    expect(migration).toContain("private.v3_voting_config_history");
    expect(migration).toContain("primary key (show_id, version)");
    expect(migration).toContain("before insert or update of voting_config on public.shows");
    expect(migration).toContain("after insert or update of voting_config on public.shows");
    expect(migration).toContain("version=private.v3_voting_config_versions.version+1");
    expect(migration).not.toContain("create table if not exists public.voting_config");
  });

  it("validates canonical fields plus downstream Televote round structure without stripping compatibility metadata", () => {
    const shape = block(
      "create or replace function private.v3_assert_voting_config_shape",
      "create or replace function private.v3_assert_voting_config_televote_round_shape",
    );
    for (const key of [
      "juryEnabled",
      "televoteEnabled",
      "juryPoints",
      "televotePoints",
      "weighting",
      "tieBreak",
      "qualifiers",
      "allowSelfVote",
    ]) {
      expect(shape).toContain(`'${key}'`);
    }
    expect(shape).not.toContain("jsonb_object_keys");

    const rounds = block(
      "create or replace function private.v3_assert_voting_config_televote_round_shape",
      "create or replace function private.v3_voting_config_evidence",
    );
    expect(rounds).toContain("jsonb_array_length(p_config -> 'televoteRounds') > 2");
    expect(rounds).toContain("v_weight < 0 or v_weight > 100");
    expect(rounds).toContain("abs(v_weight_sum - 100) > 0.0001");
    expect(rounds).toContain("v_id = any(v_ids)");
  });

  it("keeps qualifier_count exactly synchronized for legacy readers", () => {
    const guard = block(
      "create or replace function private.v3_guard_voting_config_write",
      "create or replace function private.v3_record_voting_config_version",
    );
    expect(guard).toContain("new.qualifier_count := (new.voting_config ->> 'qualifiers')::integer");
    expect(guard).toContain("new.qualifier_count := null");
  });

  it("hard-freezes config after any official Jury, Televote, Result or outcome-publication evidence", () => {
    const evidence = block(
      "create or replace function private.v3_voting_config_evidence",
      "create or replace function private.v3_voting_config_change_blocked",
    );
    for (const key of [
      "juryScoreRows",
      "juryBallotSubmissions",
      "juryBallotStatuses",
      "televoteRows",
      "televoteContributionRows",
      "televoteFrozenBindings",
      "resultCalculationVersion",
      "resultReviewedVersion",
      "resultLockedVersion",
      "resultRevealReadyVersion",
      "resultPublicationProtected",
    ]) {
      expect(evidence).toContain(`'${key}'`);
    }
    expect(evidence).toContain("control.state in ('scheduled','public')");
    expect(evidence).toContain("private.studio2_publication_has_outcomes(control.frozen_config)");
    expect(migration).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(migration).toContain("Voting configuration is frozen after official voting or outcome evidence exists.");
  });

  it("keeps direct legacy show writes behind the same validation/freeze guard", () => {
    const guard = block(
      "create or replace function private.v3_guard_voting_config_write",
      "create or replace function private.v3_record_voting_config_version",
    );
    expect(guard).toContain("private.v3_assert_voting_config_shape");
    expect(guard).toContain("private.v3_assert_voting_config_televote_round_shape");
    expect(guard).toContain("old.voting_config is distinct from new.voting_config");
    expect(guard).toContain("private.v3_assert_voting_config_change_allowed(new.edition_id,new.id)");
  });

  it("exposes exact-edition snapshot and preflight with only pre-voting R2 changes", () => {
    const snapshot = block(
      "create or replace function public.studio2_voting_config_snapshot",
      "create or replace function public.studio2_voting_config_preflight",
    );
    expect(snapshot).toContain("studio2_access_allowed('voting.manage',p_edition_id,false)");
    expect(snapshot).toContain("s.id=p_show_id and s.edition_id=p_edition_id");
    expect(snapshot).toContain("'summary'");
    expect(snapshot).toContain("'resultConfigVersion'");

    const preflight = block(
      "create or replace function public.studio2_voting_config_preflight",
      "create or replace function public.studio2_apply_voting_config_change",
    );
    expect(preflight).toContain("when v_blocked then 'blocked' else 'R2'");
    expect(preflight).toContain("'reasonRequired',false");
    expect(preflight).toContain("'expectedVersion'");
    expect(preflight).toContain("'recalculationRequired'");
  });

  it("claims/replays the S2 operation before mutable authorization/evidence/version checks", () => {
    const apply = block("create or replace function public.studio2_apply_voting_config_change");
    const claim = apply.indexOf("v_claim := private.studio2_claim_operation(");
    const replay = apply.indexOf("if coalesce((v_claim ->> 'replayed')::boolean,false)");
    const access = apply.indexOf("studio2_access_allowed('voting.manage'");
    const showLock = apply.indexOf("for update;");
    const versionConflict = apply.indexOf("message='VERSION_CONFLICT'");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(access).toBeGreaterThan(replay);
    expect(showLock).toBeGreaterThan(access);
    expect(versionConflict).toBeGreaterThan(showLock);
    expect(apply).toContain("return public.studio2_reconcile_operation");
    expect(apply).toContain("'voting.configure','R2'");
  });

  it("does not fabricate exact historical VotingConfig provenance for existing calculated Results", () => {
    expect(migration).toContain("add column if not exists voting_config_version bigint");
    expect(migration).toContain("Only future/new calculations are allowed to claim exact config provenance");
    expect(migration).not.toContain("update public.studio2_result_operations operation\nset voting_config_version");
    expect(migration).not.toContain("operation.voting_config_version is null");
    expect(migration).toContain("old.calculation_version is distinct from new.calculation_version");
    expect(migration).toContain("Result calculation cannot bind a VotingConfig version");
  });

  it("records audit + immutable canonical event without inventing unimplemented consequence consumers", () => {
    const apply = block("create or replace function public.studio2_apply_voting_config_change");
    expect(apply).toContain("insert into public.admin_audit_log");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("'voting.configuration_changed'");
    expect(apply).toContain("'voting_configuration'");
    expect(apply).toContain("array[]::text[]");
    expect(apply).toContain("return private.studio2_complete_operation(p_operation_id,v_result)");
  });

  it("does not silently recalculate or publish Results inside configuration mutation", () => {
    const apply = block("create or replace function public.studio2_apply_voting_config_change");
    expect(apply).not.toContain("sync_show_results_from_votes");
    expect(apply).not.toContain("studio2_apply_result");
    expect(apply).not.toContain("studio2_apply_show_publication");
  });
});
