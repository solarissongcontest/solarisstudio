import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const archiveConsequences = readFileSync(
  'supabase/migrations/20261019110500_v3_s14_archive_consequences.sql',
  'utf8',
);
const notificationReconciliation = readFileSync(
  'supabase/migrations/20261019110600_v3_resolved_task_notification_reconciliation.sql',
  'utf8',
);
const archiveCommand = readFileSync(
  'supabase/migrations/20261019110700_v3_s14_archive_command_integrity.sql',
  'utf8',
);
const lifecycleCommand = readFileSync(
  'supabase/migrations/20261019110800_v3_edition_transition_command_v3.sql',
  'utf8',
);
const controlRoom = readFileSync('src/lib/studio2-control-room.ts', 'utf8');
const client = readFileSync('src/lib/v3-edition-transition-client.ts', 'utf8');

describe('System V3 S14 archive consequence contract', () => {
  it('keeps studio2_edition_runtime as the single lifecycle authority', () => {
    expect(archiveConsequences).toContain('public.studio2_edition_runtime');
    expect(lifecycleCommand).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
    expect(archiveConsequences).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
    expect(lifecycleCommand).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
  });

  it('guards archive against direct or legacy runtime mutation', () => {
    expect(archiveCommand).toContain('private.v3_guard_archive_runtime_transition');
    expect(archiveCommand).toContain('solaris.v3_archive_command');
    expect(archiveCommand).toContain('Archive transition must use the canonical V3 archive command');
    expect(lifecycleCommand).toContain("set_config('solaris.v3_archive_command', 'allowed', true)");
  });

  it('uses one versioned and idempotent browser lifecycle authority', () => {
    expect(lifecycleCommand).toContain(
      'create or replace function public.studio2_transition_edition_v3(',
    );
    expect(lifecycleCommand).toContain('p_expected_version bigint');
    expect(lifecycleCommand).toContain('p_operation_id uuid');
    expect(lifecycleCommand).toContain('p_idempotency_key text');
    expect(lifecycleCommand).toContain('private.studio2_claim_operation(');
    expect(lifecycleCommand).toContain('v_runtime.version is distinct from p_expected_version');
    expect(lifecycleCommand).toContain("message = 'VERSION_CONFLICT'");
    expect(lifecycleCommand).toContain('private.studio2_complete_operation(p_operation_id, v_result)');
    expect(lifecycleCommand).toContain(
      'revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)',
    );
    expect(lifecycleCommand).toContain(
      'grant execute on function public.studio2_transition_edition_v3(',
    );
  });

  it('emits one canonical archive fact with task consequences', () => {
    expect(lifecycleCommand).toContain("'edition.archived'");
    expect(lifecycleCommand).toContain('private.v3_emit_domain_event(');
    expect(lifecycleCommand).toContain("'runtimeVersion', v_runtime.version");
    expect(lifecycleCommand).toContain("array['edition.tasks']::text[]");
  });

  it('resolves only current-contest workflow tasks that are impossible after archive', () => {
    expect(archiveConsequences).toContain('private.v3_resolve_archived_edition_workflow_tasks');
    expect(archiveConsequences).toContain("runtime.state = 'archived'");
    expect(archiveConsequences).toContain(
      "task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\\.(transition|subsystem))\\.'",
    );
    expect(archiveConsequences).not.toContain("task.task_type ~ '^(integrity|incident)");
  });

  it('puts archive-awareness in the canonical rebuild path so dead tasks cannot resurrect', () => {
    expect(notificationReconciliation).toContain(
      'create or replace function private.studio2_reconcile_all_organizer_tasks(',
    );
    const resolveIndex = notificationReconciliation.indexOf(
      'private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)',
    );
    const syncIndex = notificationReconciliation.indexOf(
      'private.studio2_sync_task_notifications(p_edition_id)',
    );
    expect(resolveIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(resolveIndex);
  });

  it('retains notification history while removing false action state', () => {
    expect(notificationReconciliation).toContain('private.v3_reconcile_resolved_task_notifications');
    expect(notificationReconciliation).toContain("task.state = 'resolved'");
    expect(notificationReconciliation).toContain('requires_action = false');
    expect(notificationReconciliation).not.toMatch(/delete\s+from\s+public\.admin_notifications/i);
  });

  it('uses a replay-safe service-only outbox consumer', () => {
    expect(notificationReconciliation).toContain(
      'create or replace function public.studio2_process_edition_domain_event(',
    );
    expect(notificationReconciliation).toContain('private.studio2_request_is_service_role()');
    expect(notificationReconciliation).toContain('private.v3_domain_event_consumer_receipts');
    expect(notificationReconciliation).toContain('public.studio2_complete_domain_event_delivery');
    expect(notificationReconciliation).toContain(
      'grant execute on function public.studio2_process_edition_domain_event',
    );
  });

  it('cuts the default Control Room path over to the V3 command with bounded reconciliation', () => {
    expect(controlRoom).toContain("import { transitionEditionV3 } from './v3-edition-transition-client'");
    expect(controlRoom).toContain('const runtime = await source.loadEditionRuntime(request.editionId)');
    expect(controlRoom).toContain('expectedVersion: runtime.version');
    expect(controlRoom).toContain('idempotencyKey: `edition-transition:${operationId}`');
    expect(client).toContain("client.rpc('studio2_transition_edition_v3'");
    expect(client).toContain("'studio2_reconcile_operation'");
    expect(client).toContain('p_expected_version: request.expectedVersion');
  });
});
