import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023211000_v3_results_reviewed_input_cas.sql",
  ),
  "utf8",
);

const service = readFileSync(
  resolve(process.cwd(), "src/lib/studio2-results-operations.ts"),
  "utf8",
);

describe("V3 Results reviewed-input CAS", () => {
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
      "public.televote_votes",
      "public.results",
    ]) {
      expect(migration).toContain(`on ${relation}`);
    }

    expect(migration).toContain("update of voting_config, published, publication_config on public.shows");
    expect(migration).toContain("private.studio2_bump_result_review_basis");
    expect(migration).toContain("review_basis_version = public.studio2_result_operations.review_basis_version + 1");
  });

  it("backfills and seeds one authority row so the first post-review mutation cannot reuse the preview version", () => {
    expect(migration).toContain("from public.shows s\non conflict (show_id) do nothing");
    expect(migration).toContain("studio2_results_review_basis_shows after insert or update of");
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
