import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261104170500_v3_results_reviewed_input_cas.sql",
  ),
  "utf8",
);

const service = readFileSync(
  resolve(process.cwd(), "src/lib/studio2-results-operations.ts"),
  "utf8",
);

describe("V3 Results reviewed-input CAS", () => {
  it("includes a fail-closed isolated PostgreSQL authority rehearsal", () => {
    const runner = readFileSync(
      resolve(process.cwd(), "scripts/rehearse-v3-results-reviewed-input-cas.sh"),
      "utf8",
    );
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/v3-results-reviewed-input-cas-rehearsal.yml"),
      "utf8",
    );
    expect(runner).toContain("local_db_pattern='^postgres(ql)?://postgres:postgres@");
    expect(runner).toContain("local_api_pattern='^http://");
    expect(runner).toContain("Refusing hosted Supabase database");
    expect(runner).toContain("SHOW_INSERT_DID_NOT_SEED_REVIEW_BASIS");
    expect(runner).toContain("VOTING_INPUT_DID_NOT_INVALIDATE_REVIEWED_RELEASE");
    expect(runner).toContain("JURY_BALLOT_SUBMISSION_INVALIDATION_MISSING");
    expect(runner).toContain("INPUT_MUTATION_ERASED_IMMUTABLE_RESULT_VERSION");
    expect(runner).toContain("ANON_CAN_EXECUTE_REVIEWED_COMMIT");
    expect(runner).toContain("rollback;");
    expect(runner).not.toContain("disable trigger");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase stop --no-backup");
    expect(workflow).toContain("github.event.pull_request.head.sha");
    expect(workflow).not.toContain("secrets.");
  });

  it("is an additive S13-registered forward-fix migration", () => {
    expect(migration).toContain("v3_register_migration_contract");
    expect(migration).toContain("'v3.results.reviewed-input-cas'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("add column if not exists review_basis_version bigint not null default 1");
    expect(migration).not.toContain("drop column");
    expect(migration).not.toContain("drop table");
  });

  it("versions every canonical relation consumed by the current Results readiness basis", () => {
    for (const relation of [
      "public.participants",
      "public.voters",
      "public.jury_votes",
      "public.jury_ballot_statuses",
      "public.jury_ballot_submissions",
      "public.televote_votes",
      "public.results",
    ]) {
      expect(migration).toContain(`on ${relation}`);
    }

    expect(migration).toContain("update of voting_config on public.shows");
    expect(migration).toContain("private.studio2_bump_result_review_basis");
    expect(migration).toContain("review_basis_version = public.studio2_result_operations.review_basis_version + 1");
  });

  it("backfills and seeds one authority row so the first post-review mutation cannot reuse the preview version", () => {
    expect(migration).toContain("from public.shows s\non conflict (show_id) do nothing");
    expect(migration).toContain("studio2_results_review_basis_shows after insert or update of");
    expect(migration).toContain("perform private.studio2_bump_result_review_basis(new.id)");
  });

  it("invalidates finalized Results release pointers when ANY canonical input changes", () => {
    const start = migration.indexOf("create or replace function private.studio2_bump_result_review_basis(");
    const end = migration.indexOf("revoke all on function private.studio2_bump_result_review_basis(", start);
    const bump = migration.slice(start, end);
    expect(bump).toContain("review_basis_version = public.studio2_result_operations.review_basis_version + 1");
    for (const field of [
      "reviewed_version", "reviewed_at", "reviewed_by",
      "locked_version", "locked_at", "locked_by",
      "reveal_ready_version", "reveal_ready_at", "reveal_ready_by",
    ]) expect(bump).toContain(field + " = null");
    expect(bump).not.toContain("delete from private.v3_result_versions");
    expect(migration).toContain("studio2_results_review_basis_jury_submissions");
  });

  it("does not undo a reviewed Results release during canonical publication", () => {
    const showChange = migration.slice(
      migration.indexOf("create or replace function private.studio2_result_review_basis_show_changed("),
      migration.indexOf("revoke all on function private.studio2_result_review_basis_show_changed("),
    );
    expect(showChange).toContain("if new.voting_config is distinct from old.voting_config then");
    expect(showChange).not.toContain("or new.published is distinct from old.published");
    expect(showChange).not.toContain("or new.publication_config is distinct from old.publication_config");
    expect(migration).toContain(
      "studio2_results_review_basis_shows after insert or update of voting_config on public.shows",
    );
  });

  it("locks the authority row NOWAIT to abort conflicting result-row mutations without deadlock", () => {
    const bump = migration.slice(
      migration.indexOf("create or replace function private.studio2_bump_result_review_basis("),
      migration.indexOf("revoke all on function private.studio2_bump_result_review_basis("),
    );
    expect(bump).toContain("for update nowait");
    expect(bump).toContain("when lock_not_available then");
    expect(bump).toContain("raise sqlstate 'PT409'");
    expect(bump).toContain("RESULTS_REVIEW_BASIS_BUSY");
    expect(bump.indexOf("for update nowait")).toBeLessThan(bump.indexOf("update public.studio2_result_operations"));
  });

  it("executes a negative reviewed-commit stale-input CAS without emitting a receipt", () => {
    const runner = readFileSync(
      resolve(process.cwd(), "scripts/rehearse-v3-results-reviewed-input-cas.sh"),
      "utf8",
    );
    expect(runner).toContain("studio2_execute_result_operation_v2(");
    expect(runner).toContain("(select basis from v3_cas_before)");
    expect(runner).toContain("exception when sqlstate 'PT409'");
    expect(runner).toContain("STALE_REVIEWED_INPUT_WAS_ACCEPTED");
    expect(runner).toContain("STALE_REVIEW_EXECUTED_MUTATION");
    expect(runner).toContain("STALE_REVIEW_REJECTION_CHANGED_AUTHORITY");
    expect(runner).toContain("rollback;");
  });

  it("maintains the existing S3 result-version rehearsal with a pre-seeded authority row", () => {
    const script = readFileSync(
      resolve(process.cwd(), ".github/scripts/v3-s3-results-invariants-rehearsal.sh"), "utf8",
    );
    expect(script).toContain("on conflict (show_id) do update");
    expect(script).toContain("where public.studio2_result_operations.edition_id=excluded.edition_id");
    expect(script).toContain("calculation_version=1");
    expect(script).toContain("reviewed_version=1");
    expect(script).toContain("locked_version=1");
    expect(script).toContain("reveal_ready_version=1");
    expect(script).toContain("snapshot rewrite");
    expect(script).toContain("cross-edition result");
  });

  it("installs show creation invalidation BEFORE the backfill to cover concurrent show inserts", () => {
    const triggerIndex = migration.indexOf("studio2_results_review_basis_shows after insert or update of");
    const backfillIndex = migration.indexOf("from public.shows s\non conflict (show_id) do nothing");
    expect(triggerIndex).toBeGreaterThan(0);
    expect(backfillIndex).toBeGreaterThan(triggerIndex);
    expect(migration).toContain("perform private.studio2_bump_result_review_basis(new.id)");
  });

  it("exposes an authoritative preflight with both calculation and reviewed-input versions", () => {
    expect(migration).toContain("public.studio2_result_operation_preview_v2");
    expect(migration).toContain("private.studio2_can_verify_results(v_actor, v_show.edition_id)");
    expect(migration).toContain("'calculationVersion', v_ops.calculation_version");
    expect(migration).toContain("'reviewBasisVersion', v_ops.review_basis_version");
    expect(migration).toContain("'stateVersion', v_ops.calculation_version::text || ':' || v_ops.review_basis_version::text");
    expect(migration).toContain("'preconditions', v_pre");
  });

  it("checks replay before mutable current state so lost-response reconciliation survives later drift", () => {
    const replayIndex = migration.indexOf("where e.execution_id = p_execution_id;");
    const authorityLockIndex = migration.indexOf(
      "where o.show_id = p_show_id\n  for update;",
      replayIndex,
    );
    const basisCheckIndex = migration.indexOf(
      "p_expected_review_basis_version <> v_ops.review_basis_version",
      authorityLockIndex,
    );

    expect(replayIndex).toBeGreaterThan(-1);
    expect(authorityLockIndex).toBeGreaterThan(replayIndex);
    expect(basisCheckIndex).toBeGreaterThan(authorityLockIndex);
    expect(migration).toContain("'idempotentReplay', true");
    expect(migration).toContain("'reviewInputProtected', true");
  });

  it("rejects stale calculation or reviewed-input basis under the per-show authority lock", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('studio2-results:' || p_show_id::text, 0))");
    expect(migration).toContain("p_expected_version <> v_ops.calculation_version");
    expect(migration).toContain("p_expected_review_basis_version <> v_ops.review_basis_version");
    expect(migration).toContain("Results inputs changed since this action was reviewed");
    expect(migration).toContain("using errcode = 'PT409'");
  });

  it("keeps the existing Results mutation engine authoritative instead of forking lifecycle logic", () => {
    const basisCheckIndex = migration.indexOf(
      "p_expected_review_basis_version <> v_ops.review_basis_version",
    );
    const legacyExecuteIndex = migration.indexOf(
      "v_result := public.studio2_execute_result_operation(",
    );

    expect(legacyExecuteIndex).toBeGreaterThan(basisCheckIndex);
    expect(migration).toContain("reviewBasisVersionBefore");
    expect(migration).toContain("reviewBasisVersionAfter");
  });

  it("publishes a typed consumer contract without breaking the compatibility path", () => {
    expect(service).toContain("export type Studio2ResultOperationReview");
    expect(service).toContain("export type Studio2ReviewedResultExecution");
    expect(service).toContain("loadStudio2ResultOperationReview");
    expect(service).toContain("studio2_result_operation_preview_v2");
    expect(service).toContain("executeReviewedStudio2ResultOperation");
    expect(service).toContain("studio2_execute_result_operation_v2");
    expect(service).toContain("expectedReviewBasisVersion");

    // Legacy consumers remain valid until Organizer performs its own cutover.
    expect(service).toContain("export async function executeStudio2ResultOperation");
    expect(service).toContain("rpc('studio2_execute_result_operation', {");
  });
});
