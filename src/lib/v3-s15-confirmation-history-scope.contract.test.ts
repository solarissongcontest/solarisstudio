import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = file("supabase/migrations/20261104155000_v3_s15_confirmation_history_version_scope.sql");
const route = file("src/routes/_authenticated/admin/submission-versions.tsx");
const reader = file("src/integrations/confirmations/v3-version-summary.ts");
const registry = file("src/lib/v3-organizer-capability-registry.ts");

describe("S15 Confirmation History edition-scoped index", () => {
  it("declares one new forward-only semantic authority without changing legacy access", () => {
    expect(sql).toContain("v3_register_migration_contract(");
    expect(sql).toContain("'v3.organizer.confirmation-history-summary-scope'");
    expect(sql).toContain("'forward_fix_only'");
    expect(sql).toContain("create or replace function public.admin_confirmation_version_summary_v2(");
    expect(sql).not.toContain("drop function");
    expect(sql).not.toContain("truncate ");
    expect(sql).not.toContain("create or replace function public.admin_confirmation_version_summary()");
  });

  it("authorizes exact edition and rejects foreign ids before returning data", () => {
    expect(sql).toContain("if auth.uid() is null");
    expect(sql).toContain("cardinality(p_submission_ids) > 200");
    expect(sql).toContain("private.solaris_confirmation_admin_read_allowed(p_edition_id, false)");
    expect(sql).toContain("submission.edition_id = p_edition_id");
    expect(sql).toContain("INVALID_SUBMISSION_SCOPE");
    expect(sql).toContain("join public.submissions submission");
    expect(sql).toContain("version.submission_id = any(p_submission_ids)");
    expect(sql).not.toContain("version.snapshot");
    expect(sql).not.toContain("recovery_code");
    expect(sql).toContain("grant execute on function public.admin_confirmation_version_summary_v2(uuid, uuid[])");
    expect(sql).toContain("to authenticated;");
  });

  it("removes all-global response and version-summary reads from Submission History", () => {
    expect(route).toContain("loadAllConfirmationResponsesForEdition<ResponseRow>(editionId)");
    expect(route).toContain("loadConfirmationVersionSummariesForEdition(");
    expect(route).not.toContain("confirmationsSupabase.rpc('admin_confirmation_responses')");
    expect(route).not.toContain("confirmationsSupabase.rpc('admin_confirmation_version_summary')");
    expect(reader).toContain('"admin_confirmation_version_summary_v2"');
    expect(reader).toContain("p_edition_id: editionId");
    expect(reader).toContain("p_submission_ids: pageIds");
    expect(reader).toContain("const MAX_PAGE = 200");
    expect(reader).toContain("const MAX_TOTAL = 5_000");
  });

  it("does not falsely certify the remaining historical restore write authority", () => {
    expect(registry).toContain('id === "delegation-submission-history"');
    expect(route).toContain("<ConfirmationVersionHistory");
  });
});
