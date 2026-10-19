import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020001000_v3_admin_deadline_operations.sql",
  ),
  "utf8",
);
const client = readFileSync(resolve(process.cwd(), "src/lib/admin-ops.ts"), "utf8");

describe("V3 governed custom Organizer reminders", () => {
  it("adds monotonic reminder versions under the S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020001000_v3_admin_deadline_operations");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("add column if not exists version bigint");
    expect(migration).toContain("check (version >= 1)");
    expect(migration).toContain("version = version + 1");
  });

  it("binds both commands to exact server-authorized edition/show scope", () => {
    expect(migration).toContain("private.v3_admin_deadline_scope_allowed");
    expect(migration).toContain("show_row.edition_id");
    expect(migration).toContain("v_show_edition_id is distinct from p_edition_id");
    expect(migration).toContain("studio2_access_allowed('edition.manage', p_edition_id, true)");
    expect(migration).toContain("message = 'AUTHORIZATION'");
  });

  it("uses the common semantic idempotency and reconciliation boundary", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'task.reminder.create'");
    expect(migration).toContain("'task.reminder.complete'");
    expect(migration).toContain("'task.reminder.reopen'");
    expect(migration).toContain("public.studio2_reconcile_operation(v_canonical_operation_id)");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("for update");
  });

  it("writes audit evidence and task DomainEvent/outbox facts atomically", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'organizer_reminder_created'");
    expect(migration).toContain("'organizer_reminder_completed'");
    expect(migration).toContain("'organizer_reminder_reopened'");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'task.opened'");
    expect(migration).toContain("'task.resolved'");
    expect(migration).toContain("array['task.custom-reminder']::text[]");
  });

  it("projects reminders into canonical Organizer Tasks and provides a retry-safe outbox consumer", () => {
    expect(migration).toContain("private.v3_reconcile_admin_deadline_task");
    expect(migration).toContain("insert into public.studio2_organizer_tasks");
    expect(migration).toContain("'admin-deadline:' || v_deadline.id::text");
    expect(migration).toContain("studio2_process_custom_reminder_domain_event");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("studio2_complete_domain_event_delivery");
    expect(migration).toContain("'custom-reminder-task-reconciliation'");
  });

  it("retires authenticated direct writes while preserving RLS-backed reads", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on public.admin_deadlines from authenticated",
    );
    expect(migration).toContain("grant select on public.admin_deadlines to authenticated");
    expect(client).not.toContain('.from("admin_deadlines")\n        .insert(');
    expect(client).not.toContain('.from("admin_deadlines")\n        .update(');
    expect(client).toContain('rpc("studio2_create_admin_deadline"');
    expect(client).toContain('rpc("studio2_set_admin_deadline_completed"');
  });

  it("preserves the same operation identity and expected version across ambiguous client retries", () => {
    expect(client).toContain("pendingOperation.current?.fingerprint === fingerprint");
    expect(client).toContain("pendingOperations.current.get(operationKey)");
    expect(client).toContain("expectedVersion: snapshot.version");
    expect(client).toContain("p_expected_version: identity.expectedVersion");
    expect(client).toContain("p_operation_id: identity.operationId");
    expect(client).toContain("p_idempotency_key: identity.idempotencyKey");
    expect(client).toContain("onSettled: () => qc.invalidateQueries");
  });
});
