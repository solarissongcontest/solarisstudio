import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const archive = readFileSync(
  "supabase/migrations/20261017003000_v3_s14_archive_consequences.sql",
  "utf8",
);
const notificationReconciliation = readFileSync(
  "supabase/migrations/20261017003100_v3_resolved_task_notification_reconciliation.sql",
  "utf8",
);

describe("System V3 S14 archive consequence contract", () => {
  it("keeps studio2_edition_runtime as the single lifecycle authority", () => {
    expect(archive).toContain("create or replace function public.studio2_transition_edition_v2(");
    expect(archive).toContain("public.studio2_edition_runtime");
    expect(archive).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
    expect(archive).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
  });

  it("makes a lost-response archive retry semantically idempotent", () => {
    expect(archive).toContain("if p_to = 'archived' and v_runtime.state = 'archived' then");
    expect(archive).toContain("return v_runtime;");
    expect(archive).toContain("'edition.transition.archived'");
    expect(archive).toContain("private.studio2_claim_operation");
    expect(archive).toContain("private.studio2_complete_operation");
  });

  it("emits legacy and canonical archive facts with exact runtime provenance", () => {
    expect(archive).toContain("'edition.state_changed'");
    expect(archive).toContain("'edition.archived'");
    expect(archive).toContain("private.v3_emit_domain_event");
    expect(archive).toContain("'runtimeVersion', v_runtime.version");
    expect(archive).toContain("array['edition.tasks']::text[]");
  });

  it("resolves only workflow task families that are impossible after archive", () => {
    expect(archive).toContain("private.v3_resolve_archived_edition_workflow_tasks");
    expect(archive).toContain("runtime.state = 'archived'");
    expect(archive).toContain(
      "task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\\.(transition|subsystem))\\.'",
    );
    expect(archive).not.toContain("task.task_type ~ '^(integrity|incident)");
  });

  it("puts archive-awareness in the canonical rebuild path so dead tasks cannot resurrect", () => {
    expect(archive).toContain("create or replace function private.studio2_reconcile_all_organizer_tasks(");
    expect(archive).toContain("private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)");
    expect(archive).toContain("private.studio2_sync_task_notifications(p_edition_id)");
    expect(notificationReconciliation).toContain(
      "create or replace function private.studio2_reconcile_all_organizer_tasks(",
    );
    const resolveIndex = notificationReconciliation.indexOf(
      "private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)",
    );
    const syncIndex = notificationReconciliation.indexOf(
      "private.studio2_sync_task_notifications(p_edition_id)",
    );
    expect(resolveIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(resolveIndex);
  });

  it("retains resolved notification history while removing false action state", () => {
    expect(notificationReconciliation).toContain(
      "private.v3_reconcile_resolved_task_notifications",
    );
    expect(notificationReconciliation).toContain("task.state = 'resolved'");
    expect(notificationReconciliation).toContain("requires_action = false");
    expect(notificationReconciliation).not.toMatch(/delete\s+from\s+public\.admin_notifications/i);
  });

  it("uses a replay-safe service-only outbox consumer", () => {
    expect(notificationReconciliation).toContain(
      "create or replace function public.studio2_process_edition_domain_event(",
    );
    expect(notificationReconciliation).toContain("private.studio2_request_is_service_role()");
    expect(notificationReconciliation).toContain("private.v3_domain_event_consumer_receipts");
    expect(notificationReconciliation).toContain("public.studio2_complete_domain_event_delivery");
    expect(notificationReconciliation).toContain("grant execute on function public.studio2_process_edition_domain_event");
  });
});
