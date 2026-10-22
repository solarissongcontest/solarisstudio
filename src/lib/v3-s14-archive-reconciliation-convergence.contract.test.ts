import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261021202000_v3_s14_archive_reconciliation_convergence.sql',
  'utf8',
);

describe('System V3 S14 Archive reconciliation convergence', () => {
  it('keeps the complete canonical producer set behind the private Archive gate', () => {
    expect(migration).toContain('private.v3_archive_task_reconciliation_gates');
    expect(migration).toContain('txid_current()');

    for (const producer of [
      'studio2_reconcile_organizer_tasks',
      'studio2_reconcile_organizer_tasks_operational',
      'studio2_repair_jury_missing_ballot_tasks',
      'studio2_reconcile_confirmation_requirement_tasks',
      'studio2_reconcile_organizer_tasks_truth',
      'studio2_reconcile_permission_approval_tasks',
      'studio2_reconcile_system_job_tasks',
      'studio2_reconcile_jury_ballot_review_tasks',
      'studio2_reconcile_confirmation_sync_tasks',
    ]) {
      expect(migration).toContain(`private.${producer}`);
    }
  });

  it('preserves the S14 terminal resolver and resolved-notification reconciliation', () => {
    expect(migration).toContain(
      'private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)',
    );
    expect(migration).toContain("where runtime.state = 'archived'");
    expect(migration).toContain(
      'private.v3_reconcile_resolved_task_notifications(p_edition_id)',
    );
    expect(migration).toContain(
      'private.studio2_prune_stale_task_notifications(p_edition_id)',
    );
  });

  it('keeps the rebuild system-only', () => {
    expect(migration).toContain(
      'revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain(
      'grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)',
    );
    expect(migration).toContain('to service_role');
  });
});
