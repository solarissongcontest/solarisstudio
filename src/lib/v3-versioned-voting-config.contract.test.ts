import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019231500_v3_versioned_voting_config.sql"),
  "utf8",
);

function section(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("V3 versioned VotingConfig authority", () => {
  it("registers an additive forward-fix migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'20261019231500_v3_versioned_voting_config'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("keeps shows.voting_config as compatibility truth but versions every change immutably", () => {
    expect(migration).toContain("private.v3_voting_config_versions");
    expect(migration).toContain("private.v3_voting_config_history");
    expect(migration).toContain("primary key (show_id, version)");
    expect(migration).toContain("after insert or update of voting_config on public.shows");
    expect(migration).toContain("version = private.v3_voting_config_versions.version + 1");
    expect(migration).toContain("coalesce(new.voting_config, '{}'::jsonb)");
    expect(migration).not.toContain("create table if not exists public.voting_config");
  });

  it("validates canonical voting fields without stripping unknown compatibility metadata", () => {
    const validator = section(
      "create or replace function private.v3_assert_voting_config_shape(p_config jsonb)",
      "create or replace function private.v3_voting_config_evidence(",
    );
    expect(validator).toContain("'juryEnabled'");
    expect(validator).toContain("'televoteEnabled'");
    expect(validator).toContain("'juryPoints'");
    expect(validator).toContain("'televotePoints'");
    expect(validator).toContain("'weighting'");
    expect(validator).toContain("'tieBreak'");
    expect(validator).toContain("'qualifiers'");
    expect(validator).toContain("'allowSelfVote'");
    expect(validator).not.toContain("jsonb_object_keys");
  });

  it("treats official voting and result evidence as a hard configuration freeze", () => {
    expect(migration).toContain("private.v3_voting_config_evidence(");
    expect(migration).toContain("'juryScoreRows'");
    expect(migration).toContain("'juryBallotSubmissions'");
    expect(migration).toContain("'juryBallotStatuses'");
    expect(migration).toContain("'televoteRows'");
    expect(migration).toContain("'televoteContributionRows'");
    expect(migration).toContain("'televoteFrozenBindings'");
    expect(migration).toContain("'resultCalculationVersion'");
    expect(migration).toContain("'resultLockedVersion'");
    expect(migration).toContain("message = 'DEPENDENCY_FAILURE'");
  });

  it("guards legacy direct show updates too, not only the new Organizer command", () => {
    expect(migration).toContain("before insert or update of voting_config on public.shows");
    const guard = section(
      "create or replace function private.v3_guard_voting_config_write()",
      "create or replace function private.v3_record_voting_config_version()",
    );
    expect(guard).toContain("old.voting_config is distinct from new.voting_config");
    expect(guard).toContain("private.v3_assert_voting_config_change_allowed(new.edition_id, new.id)");
  });

  it("exposes exact-edition snapshot and consequence-aware preflight", () => {
    const snapshot = section(
      "create or replace function public.studio2_voting_config_snapshot(",
      "create or replace function public.studio2_voting_config_preflight(",
    );
    expect(snapshot).toContain("public.studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(snapshot).toContain("show_row.id = p_show_id and show_row.edition_id = p_edition_id");
    expect(snapshot).toContain("'summary'");
    expect(snapshot).toContain("'Jury '");
    expect(snapshot).toContain("'Public '");
    expect(snapshot).toContain("'Points '");
    expect(snapshot).toContain("'Tie: '");

    const preflight = section(
      "create or replace function public.studio2_voting_config_preflight(",
      "create or replace function public.studio2_apply_voting_config_change(",
    );
    expect(preflight).toContain("'expectedVersion'");
    expect(preflight).toContain("'blocked'");
    expect(preflight).toContain("'riskClass'");
    expect(preflight).toContain("'recalculationRequired'");
    expect(preflight).toContain("'evidence'");
  });

  it("claims semantic S2 idempotency before mutable-state version checks", () => {
    const apply = section(
      "create or replace function public.studio2_apply_voting_config_change(",
      "notify pgrst, 'reload schema';",
    );
    const claim = apply.indexOf("private.studio2_claim_operation(");
    const replay = apply.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false) then");
    const showLock = apply.indexOf("select show_row.* into v_show");
    const versionConflict = apply.indexOf("message = 'VERSION_CONFLICT'");

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(showLock).toBeGreaterThan(replay);
    expect(versionConflict).toBeGreaterThan(showLock);
    expect(apply).toContain("'voting.config.update'");
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(apply).toContain("'receiptId', v_operation_id");
  });

  it("records operation provenance in immutable config history and audit", () => {
    expect(migration).toContain("current_setting('v3.voting_config_operation_id', true)");
    expect(migration).toContain("current_setting('v3.voting_config_reason', true)");
    expect(migration).toContain("changed_by");
    expect(migration).toContain("operation_id");
    expect(migration).toContain("insert into public.admin_audit_log");
  });

  it("binds official result calculations to the exact VotingConfig version", () => {
    expect(migration).toContain("add column if not exists voting_config_version bigint");
    expect(migration).toContain("private.v3_bind_result_operation_voting_config_version()");
    expect(migration).toContain("before insert or update of calculation_version");
    expect(migration).toContain("Result calculation cannot bind a VotingConfig version");
    expect(migration).toContain("operation.voting_config_version is null");
  });

  it("does not silently recalculate or publish results inside the configuration command", () => {
    const apply = section(
      "create or replace function public.studio2_apply_voting_config_change(",
      "notify pgrst, 'reload schema';",
    );
    expect(apply).not.toContain("sync_show_results_from_votes");
    expect(apply).not.toContain("studio2_apply_result");
    expect(apply).not.toContain("publication");
    expect(apply).toContain("private.v3_assert_voting_config_change_allowed");
  });
});
