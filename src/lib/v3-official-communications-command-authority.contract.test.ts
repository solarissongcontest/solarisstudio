import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020001500_v3_official_communications_command_authority.sql",
  ),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-official-communications-commands.ts"),
  "utf8",
);

describe("V3 Official Communications command authority", () => {
  it("registers the post-S13 migration as forward-only and additive", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020001500_v3_official_communications_command_authority");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).not.toMatch(/truncate/i);
  });

  it("binds every lifecycle command to explicit edition/global scope", () => {
    expect(migration).toContain("private.v3_notice_command_scope(");
    expect(migration).toContain("'scopeKind', 'edition'");
    expect(migration).toContain("'scopeKind', 'global'");
    expect(migration).toContain("message = 'SCOPE_MISMATCH'");
    expect(migration).toContain("p_notice.edition_id is distinct from p_edition_id");
    expect(migration).toContain("Global communication authority is deliberately restricted");
    expect(client).toContain('scopeKind: V3NoticeScopeKind');
    expect(client).toContain('editionId: string | null');
  });

  it("offers a server-authoritative review preflight without trusting it at commit", () => {
    expect(migration).toContain("public.v3_preflight_notice_lifecycle(");
    expect(migration).toContain("'currentRevision', v_notice.revision");
    expect(migration).toContain("'recipientReceiptCount', v_recipient_receipts");
    expect(migration).toContain("'displaySurfaces', to_jsonb(v_notice.display_surfaces)");
    expect(migration).toContain("'blockers', to_jsonb(v_blockers)");
    expect(migration).toContain("'canCommit', cardinality(v_blockers) = 0");
    expect(migration).toContain("Commit repeats scope and revision checks");
    expect(client).toContain('"v3_preflight_notice_lifecycle"');
    expect(client).toContain("Official Communications preflight crossed edition scope.");
  });

  it("claims semantic idempotency before stale revision validation", () => {
    const claim = migration.indexOf("v_claim := private.studio2_claim_operation(");
    const lock = migration.indexOf("for update;", claim);
    const cas = migration.indexOf("message = 'VERSION_CONFLICT'", claim);
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(claim);
    expect(cas).toBeGreaterThan(lock);
    expect(migration).toContain("'notice.' || p_action");
    expect(migration).toContain("'expectedRevision', p_expected_revision");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("preserves the established lifecycle validators as internal writers", () => {
    for (const rpc of [
      "public.studio2_publish_notice(p_notice_id)",
      "public.studio2_schedule_notice(p_notice_id, p_scheduled_at)",
      "public.studio2_cancel_notice(p_notice_id, p_reason)",
      "public.studio2_archive_communication(p_notice_id, p_reason)",
      "public.studio2_restore_communication(p_notice_id)",
      "public.studio2_delete_communication(p_notice_id, p_reason)",
    ]) {
      expect(migration).toContain(rpc);
    }
    expect(migration).toContain("Legacy browser RPCs remain callable during the compatibility window");
  });

  it("reuses the explicit publish operation for S5 publication consequences", () => {
    expect(migration).toContain("current_setting('solaris.v3_notice_operation_id', true)");
    expect(migration).toContain("v_receipt.command <> 'notice.publish'");
    expect(migration).toContain("v_receipt.status <> 'processing'");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'notice.notifications'");
    expect(migration).toContain("A publish that supersedes an older notice intentionally owns both facts");
  });

  it("keeps the scheduled-worker and legacy S5 transition path intact", () => {
    expect(migration).toContain("private.v3_notice_transition_operation_id(");
    expect(migration).toContain("private.studio2_request_fingerprint(");
    expect(migration).toContain("insert into public.studio2_operation_receipts");
    expect(migration).toContain("'notice.published'");
    expect(migration).toContain("'notice.superseded'");
  });

  it("does not allow review-time state to bypass commit-time locking/CAS", () => {
    const command = migration.indexOf("create or replace function public.v3_execute_notice_lifecycle(");
    const scopeRead = migration.indexOf("perform private.v3_assert_notice_command_scope", command);
    const claim = migration.indexOf("private.studio2_claim_operation(", command);
    const lock = migration.indexOf("for update;", claim);
    const scopeAgain = migration.indexOf("perform private.v3_assert_notice_command_scope", lock);
    const cas = migration.indexOf("v_notice.revision is distinct from p_expected_revision", lock);
    expect(scopeRead).toBeGreaterThan(command);
    expect(claim).toBeGreaterThan(scopeRead);
    expect(lock).toBeGreaterThan(claim);
    expect(scopeAgain).toBeGreaterThan(lock);
    expect(cas).toBeGreaterThan(scopeAgain);
  });

  it("receipts success only after the canonical legacy transition returns", () => {
    const writer = migration.indexOf("if p_action = 'publish' then");
    const result = migration.indexOf("v_result := jsonb_build_object(", writer);
    const complete = migration.indexOf("private.studio2_complete_operation(v_operation_id, v_result)", result);
    expect(writer).toBeGreaterThanOrEqual(0);
    expect(result).toBeGreaterThan(writer);
    expect(complete).toBeGreaterThan(result);
  });

  it("gives the Organizer consumer a stable operation identity and lost-response recovery", () => {
    expect(client).toContain("crypto.randomUUID()");
    expect(client).toContain("p_operation_id: operationId");
    expect(client).toContain("p_idempotency_key: operationId");
    expect(client).toContain("p_correlation_id: operationId");
    expect(client).toContain('"v3_execute_notice_lifecycle"');
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(client).toContain('recovery?.status === "succeeded"');
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("sessionStorage");
  });
});
