import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020002500_confirmation_response_access_commands.sql",
  ),
  "utf8",
);

function section(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 Confirmation response access command authority", () => {
  it("adopts the S13 migration contract without destructive schema changes", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020002500_confirmation_response_access_commands");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });

  it("versions response access and token state from the canonical response aggregate", () => {
    expect(migration).toContain("create table if not exists public.studio2_confirmation_response_versions");
    expect(migration).toContain("submission_id uuid primary key references public.submissions(id) on delete cascade");
    expect(migration).toContain("studio2_confirmation_response_touch_version");
    expect(migration).toContain("studio2_confirmation_edit_token_touch_response_version");
  });

  it("preflights exact edition + response scope and never returns secret token material", () => {
    const preview = section(
      "create or replace function public.studio2_confirmation_response_access_preview(",
      "revoke all on function public.studio2_confirmation_response_access_preview",
    );
    expect(preview).toContain("submission.edition_id = p_edition_id");
    expect(preview).toContain("studio2_access_allowed('confirmation.manage', p_edition_id, false)");
    expect(preview).toContain("'expectedVersion', v_version");
    expect(preview).toContain("'dependencies'");
    expect(preview).toContain("'tokens', v_tokens");
    expect(preview).not.toContain("token_hash");
    expect(preview).not.toContain("'token',");
  });

  it("makes response access updates expected-version, idempotent and receipted", () => {
    const apply = section(
      "create or replace function public.studio2_apply_confirmation_response_access(",
      "revoke all on function public.studio2_apply_confirmation_response_access",
    );
    expect(apply).toContain("'confirmation.response.access.update'");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("if p_expected_version <> v_version then");
    expect(apply).toContain("submission.edition_id = p_edition_id");
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(apply).toContain("'confirmation_response_access_updated'");
  });

  it("returns an edit-token plaintext secret only on first issuance and never stores it in the receipt", () => {
    const issue = section(
      "create or replace function public.studio2_issue_confirmation_edit_token(",
      "revoke all on function public.studio2_issue_confirmation_edit_token",
    );
    expect(issue).toContain("'confirmation.response.edit_token.issue'");
    expect(issue).toContain("'replayed', true");
    expect(issue).toContain("'token', null");
    expect(issue).toContain("'secretAvailable', false");
    expect(issue).toContain("perform private.studio2_complete_operation(v_operation_id, v_receipt_result)");
    expect(issue).toContain("return v_receipt_result || jsonb_build_object(");
    expect(issue).toContain("'token', v_token");
    expect(issue.indexOf("perform private.studio2_complete_operation(v_operation_id, v_receipt_result)")).toBeLessThan(
      issue.indexOf("'token', v_token"),
    );
    const receiptStart = issue.indexOf("v_receipt_result := jsonb_build_object(");
    const receiptEnd = issue.indexOf("perform private.studio2_complete_operation", receiptStart);
    expect(issue.slice(receiptStart, receiptEnd)).not.toContain("'token', v_token");
  });

  it("binds token invalidation to edition + response + token and response version", () => {
    const revoke = section(
      "create or replace function public.studio2_invalidate_confirmation_edit_token(",
      "revoke all on function public.studio2_invalidate_confirmation_edit_token",
    );
    expect(revoke).toContain("token.submission_id = p_submission_id");
    expect(revoke).toContain("submission.edition_id = p_edition_id");
    expect(revoke).toContain("if p_expected_version <> v_version then");
    expect(revoke).toContain("'confirmation.response.edit_token.revoke'");
    expect(revoke).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("fails closed on permanent response deletion until historical archival authority exists", () => {
    expect(migration).toContain("'destructiveAllowed', false");
    expect(migration).toContain("'preservationDecision', 'retain_historical_response'");
    expect(migration).toContain(
      "Permanent response deletion is blocked until Solaris has an explicit historical archival authority.",
    );
    expect(migration).not.toContain("delete from public.submissions where id = p_submission_id");
  });

  it("preserves the narrow read-only maintenance exception without allowing token issuance", () => {
    const gate = section(
      "create or replace function private.studio2_data_api_operational_gate()",
      "create or replace function private.studio2_platform_mutation_allowed(",
    );
    expect(gate).toContain("'studio2_apply_confirmation_response_access'");
    expect(gate).not.toContain("'studio2_issue_confirmation_edit_token'");
    expect(gate).not.toContain("'studio2_invalidate_confirmation_edit_token'");

    const allowed = section(
      "create or replace function private.studio2_platform_mutation_allowed(",
      "comment on function public.studio2_confirmation_response_access_preview",
    );
    expect(allowed).toContain("'confirmation.response.access.update'");
    expect(allowed).not.toContain("'confirmation.response.edit_token.issue'");
    expect(allowed).not.toContain("'confirmation.response.edit_token.revoke'");
  });
});
