import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const archiveConsequences = readFileSync(
  "supabase/migrations/20261017003000_v3_s14_archive_consequences.sql",
  "utf8",
);
const notificationReconciliation = readFileSync(
  "supabase/migrations/20261017003100_v3_resolved_task_notification_reconciliation.sql",
  "utf8",
);
const archiveCommand = readFileSync(
  "supabase/migrations/20261017003200_v3_s14_archive_command_integrity.sql",
  "utf8",
);
const persistence = readFileSync("src/lib/studio2-persistence.ts", "utf8");

describe("System V3 S14 archive consequence contract", () => {
  it("keeps studio2_edition_runtime as the single lifecycle authority", () => {
    expect(archiveConsequences).toContain("public.studio2_edition_runtime");
    expect(archiveConsequences).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
    expect(archiveConsequences).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
    expect(archiveCommand).toContain("public.studio2_edition_runtime");
    expect(archiveCommand).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
  });

  it("guards archive against the legacy transition path", () => {
    expect(archiveCommand).toContain("private.v3_guard_archive_runtime_transition");
    expect(archiveCommand).toContain("solaris.v3_archive_command");
    expect(archiveCommand).toContain("Archive transition must use the canonical V3 archive command");
    expect(archiveCommand).toContain("perform set_config('solaris.v3_archive_command', 'allowed', true)");
  });

  it("requires stable client operation identity and optimistic runtime version for archive", () => {
    expect(archiveCommand).toContain("create or replace function public.studio2_archive_edition_v3(");
    expect(archiveCommand).toContain("p_expected_version bigint");
    expect(archiveCommand).toContain("p_operation_id uuid");
    expect(archiveCommand).toContain("p_idempotency_key text");
    expect(archiveCommand).toContain("private.studio2_claim_operation(");
    expect(archiveCommand).toContain("p_operation_id,\n    p_idempotency_key,\n    p_operation_id,");
    expect(archiveCommand).toContain("'expectedRuntimeVersion', p_expected_version");
    expect(archiveCommand).toContain("v_runtime.version is distinct from p_expected_version");
    expect(archiveCommand).toContain("message = 'VERSION_CONFLICT'");
    expect(archiveCommand).toContain("private.studio2_complete_operation(p_operation_id, v_result)");
  });

  it("makes the browser persistence boundary versioned, idempotent, and reconcilable", () => {
    expect(persistence).toContain("expectedVersion?: number | null");
    expect(persistence).toContain("operationId?: string | null");
    expect(persistence).toContain("idempotencyKey?: string | null");
    expect(persistence).toContain("client.rpc('studio2_archive_edition_v3'");
    expect(persistence).toContain("p_expected_version: request.expectedVersion ?? expectedVersion");
    expect(persistence).toContain("p_operation_id: request.operationId ?? operationId");
    expect(persistence).toContain("p_idempotency_key: request.idempotencyKey ?? idempotencyKey");
    expect(persistence).toContain("'studio2_reconcile_operation'");
    expect(persistence).toContain("mapReconciledArchiveRuntime");
  });

  it("emits legacy and canonical archive facts with exact runtime provenance", () => {
    expect(archiveCommand).toContain("'edition.state_changed'");
    expect(archiveCommand).toContain("'edition.archived'");
    expect(archiveCommand).toContain("private.v3_emit_domain_event");
    expect(archiveCommand).toContain("'runtimeVersion', v_runtime.version");
    expect(archiveCommand).toContain("array['edition.tasks']::text[]");
  });

  it("resolves only workflow task families that are impossible after archive", () => {
    expect(archiveConsequences).toContain("private.v3_resolve_archived_edition_workflow_tasks");
    expect(archiveConsequences).toContain("runtime.state = 'archived'");
    expect(archiveConsequences).toContain(
      "task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\\.(transition|subsystem))\\.'",
    );
    expect(archiveConsequences).not.toContain("task.task_type ~ '^(integrity|incident)");
  });

  it("puts archive-awareness in the canonical rebuild path so dead tasks cannot resurrect", () => {
    expect(archiveConsequences).toContain("create or replace function private.studio2_reconcile_all_organizer_tasks(");
    expect(archiveConsequences).toContain("private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)");
    expect(archiveConsequences).toContain("private.studio2_sync_task_notifications(p_edition_id)");
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
