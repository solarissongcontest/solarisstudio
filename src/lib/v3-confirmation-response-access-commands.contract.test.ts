import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019223000_v3_confirmation_response_access_commands.sql",
  ),
  "utf8",
);

function between(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("V3 Confirmation response/access command authority", () => {
  it("registers an additive forward-fix migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'20261019223000_v3_confirmation_response_access_commands'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("binds preview and apply to the explicit Organizer edition", () => {
    const preview = between(
      "create or replace function public.studio2_confirmation_response_access_preview(",
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
    );
    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );

    expect(preview).toContain(
      "public.studio2_access_allowed('confirmation.manage', p_edition_id, false)",
    );
    expect(preview).toContain("s.edition_id = p_edition_id");
    expect(preview).toContain("r.edition_id = p_edition_id");

    expect(apply).toContain(
      "public.studio2_access_allowed('confirmation.manage', p_edition_id, false)",
    );
    expect(apply).toContain("s.edition_id = p_edition_id");
    expect(apply).toContain("r.edition_id = p_edition_id");
  });

  it("uses one canonical response version for access controls and recovery credentials", () => {
    expect(migration).toContain("private.v3_touch_confirmation_response_access_version()");
    expect(migration).toContain("after update of editing_allowed, locked, admin_notes");
    expect(migration).toContain("after insert or update of active, token_type, expires_at or delete");
    expect(migration).toContain("public.studio2_confirmation_review_versions.version + 1");

    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );
    expect(apply).toContain("p_expected_version bigint");
    expect(apply).toContain("for update;");
    expect(apply).toContain("raise sqlstate 'PT409' using message = 'VERSION_CONFLICT'");
  });

  it("claims semantic S2 idempotency before validating current mutable state", () => {
    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );
    const claimIndex = apply.indexOf("private.studio2_claim_operation(");
    const replayIndex = apply.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false) then");
    const rowLockIndex = apply.indexOf("select s.* into v_submission");
    const versionIndex = apply.indexOf("v_version is distinct from p_expected_version");

    expect(claimIndex).toBeGreaterThanOrEqual(0);
    expect(replayIndex).toBeGreaterThan(claimIndex);
    expect(rowLockIndex).toBeGreaterThan(replayIndex);
    expect(versionIndex).toBeGreaterThan(rowLockIndex);
    expect(apply).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(apply).toContain("'receiptId', v_canonical_operation_id");
  });

  it("never persists or replays a plaintext recovery credential", () => {
    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );
    const completeIndex = apply.indexOf(
      "private.studio2_complete_operation(v_canonical_operation_id, v_result)",
    );
    const secretReturnIndex = apply.indexOf("'token', v_token_plaintext", completeIndex);

    expect(apply).toContain("extensions.digest(v_token_plaintext, 'sha256')");
    expect(apply).toContain("'secretPersisted', false");
    expect(apply).toContain("'secretAvailable', false");
    expect(completeIndex).toBeGreaterThanOrEqual(0);
    expect(secretReturnIndex).toBeGreaterThan(completeIndex);
    expect(apply.slice(0, completeIndex)).not.toContain("'token', v_token_plaintext");
    expect(apply).toContain("'secretAvailable', true");
  });

  it("binds recovery invalidation to the same response instead of trusting a token id alone", () => {
    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );
    expect(apply).toContain("t.id = v_token_id");
    expect(apply).toContain("t.submission_id = p_submission_id");
  });

  it("fails closed on permanent deletion of historical or dependent confirmation truth", () => {
    expect(migration).toContain("private.v3_confirmation_response_delete_dependencies(");
    expect(migration).toContain("'internalEntries'");
    expect(migration).toContain("'nationalFinals'");
    expect(migration).toContain("'reviewHistory'");
    expect(migration).toContain("'submissionVersions'");
    expect(migration).toContain("'resolvedRequirements'");
    expect(migration).toContain("not coalesce(p_submission.reviewed, false)");
    expect(migration).toContain("coalesce(p_submission.edit_count, 0) = 0");

    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );
    expect(apply).toContain("perform private.studio2_require_fresh_auth(300)");
    expect(apply).toContain("raise sqlstate 'PT409' using\n        message = 'DEPENDENCY_FAILURE'");
  });

  it("does not permit permanent response deletion through the read-only maintenance exception", () => {
    const mutationGate = migration.slice(
      migration.indexOf("create or replace function private.studio2_platform_mutation_allowed("),
    );
    expect(mutationGate).toContain("'confirmation.response.access.update'");
    expect(mutationGate).toContain("'confirmation.response.recovery.issue'");
    expect(mutationGate).toContain("'confirmation.response.recovery.invalidate'");
    expect(mutationGate).not.toContain("'confirmation.response.delete'");
  });

  it("preserves canonical consequence delivery and audit evidence", () => {
    const apply = between(
      "create or replace function public.studio2_apply_confirmation_response_access_change(",
      "-- Confirmation is the only contest workflow intentionally operable",
    );
    expect(apply).toContain("insert into public.admin_audit_log");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("'confirmation.window_changed'");
    expect(apply).toContain(
      "array['confirmation.tasks', 'confirmation.notifications']::text[]",
    );
  });

  it("leaves legacy RPCs untouched for an explicit consumer cutover instead of creating two authorities", () => {
    expect(migration).not.toContain(
      "create or replace function public.admin_update_confirmation_controls(",
    );
    expect(migration).not.toContain(
      "create or replace function public.admin_confirmation_create_edit_token(",
    );
    expect(migration).not.toContain(
      "create or replace function public.admin_confirmation_revoke_edit_token(",
    );
    expect(migration).not.toContain(
      "create or replace function public.admin_confirmation_delete_response(",
    );
  });
});
