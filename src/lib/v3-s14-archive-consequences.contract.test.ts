import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261019111100_v3_s14_archive_consequence_reconciliation.sql',
  'utf8',
);
const readinessHardening = readFileSync(
  'supabase/migrations/20261019111200_v3_s14_final_results_readiness_hardening.sql',
  'utf8',
);
const rehearsal = readFileSync('.github/scripts/v3-s14-archive-system-rehearsal.sh', 'utf8');
const workflow = readFileSync('.github/workflows/v3-s14-archive-system-rehearsal.yml', 'utf8');
const controlRoom = readFileSync('src/lib/studio2-control-room.ts', 'utf8');
const client = readFileSync('src/lib/v3-edition-transition-client.ts', 'utf8');

describe('System V3 S14 archive consequence contract', () => {
  it('adopts the post-S13 migration framework instead of bypassing it', () => {
    expect(migration).toContain('insert into private.v3_migration_contracts');
    expect(migration).toContain("'v3.s14.archive-consequence-reconciliation'");
    expect(readinessHardening).toContain('insert into private.v3_migration_contracts');
    expect(readinessHardening).toContain("'v3.s14.final-results-readiness-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(readinessHardening).toContain("'forward_fix_only'");
  });

  it('keeps studio2_edition_runtime as the single lifecycle authority', () => {
    expect(migration).toContain('public.studio2_edition_runtime');
    expect(migration).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
    expect(migration).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
    expect(readinessHardening).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
  });

  it('guards archive against direct or legacy runtime mutation', () => {
    expect(migration).toContain('private.v3_guard_archive_runtime_transition');
    expect(migration).toContain('solaris.v3_archive_command');
    expect(migration).toContain('Archive transition must use the canonical V3 lifecycle command');
    expect(migration).toContain("set_config('solaris.v3_archive_command', 'allowed', true)");
  });

  it('uses one versioned and idempotent browser lifecycle authority', () => {
    expect(migration).toContain(
      'create or replace function public.studio2_transition_edition_v3(',
    );
    expect(migration).toContain('p_expected_version bigint');
    expect(migration).toContain('p_operation_id uuid');
    expect(migration).toContain('p_idempotency_key text');
    expect(migration).toContain('private.studio2_claim_operation(');
    expect(migration).toContain('v_runtime.version is distinct from p_expected_version');
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain('private.studio2_complete_operation(p_operation_id, v_result)');
    expect(migration).toContain(
      'revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)',
    );
    expect(migration).toContain(
      'grant execute on function public.studio2_transition_edition_v3(',
    );
  });

  it('reconciles multi-show edition runtime to results only from exact public Results evidence', () => {
    expect(migration).toContain("and p_to = 'results'");
    expect(migration).toContain('private.v3_edition_final_results_ready(p_edition_id)');
    expect(migration).toContain('v_reconciled_final_results := true');
    expect(migration).toContain("'reconciledFromFinalPublication', v_reconciled_final_results");
    expect(migration).not.toContain("p_to = 'archived'\n     and private.v3_edition_final_results_ready");

    expect(readinessHardening).toContain('private.v3_edition_final_results_ready');
    expect(readinessHardening).toContain("in ('grand-final', 'final')");
    expect(readinessHardening).toContain("control.state = 'public'");
    expect(readinessHardening).toContain('private.studio2_normalise_publication_config(control.frozen_config)');
    expect(readinessHardening).toContain("->> 'results'");
    expect(readinessHardening).toContain('join private.v3_result_versions result_version');
    expect(readinessHardening).toContain('result_version.result_row_count > 0');
    expect(readinessHardening).toContain('private.v3_publication_result_version_release_ready(');
  });

  it('emits one canonical archive fact with task consequences', () => {
    expect(migration).toContain("'edition.archived'");
    expect(migration).toContain('private.v3_emit_domain_event(');
    expect(migration).toContain("'runtimeVersion', v_runtime.version");
    expect(migration).toContain("array['edition.tasks']::text[]");
  });

  it('resolves only current-contest workflow tasks that are impossible after archive', () => {
    expect(migration).toContain('private.v3_resolve_archived_edition_workflow_tasks');
    expect(migration).toContain("runtime.state = 'archived'");
    expect(migration).toContain(
      "task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\\.(transition|subsystem))\\.'",
    );
    expect(migration).not.toContain("task.task_type ~ '^(integrity|incident)");
  });

  it('puts archive-awareness in the canonical rebuild path so dead tasks cannot resurrect', () => {
    expect(migration).toContain(
      'create or replace function private.studio2_reconcile_all_organizer_tasks(',
    );
    const resolveIndex = migration.indexOf(
      'private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)',
    );
    const syncIndex = migration.indexOf(
      'private.studio2_sync_task_notifications(p_edition_id)',
    );
    expect(resolveIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(resolveIndex);
  });

  it('retains notification history while removing false action state', () => {
    expect(migration).toContain('private.v3_reconcile_resolved_task_notifications');
    expect(migration).toContain("task.state = 'resolved'");
    expect(migration).toContain('requires_action = false');
    expect(migration).not.toMatch(/delete\s+from\s+public\.admin_notifications/i);
  });

  it('uses a replay-safe service-only outbox consumer', () => {
    expect(migration).toContain(
      'create or replace function public.studio2_process_edition_domain_event(',
    );
    expect(migration).toContain('private.studio2_request_is_service_role()');
    expect(migration).toContain('private.v3_domain_event_consumer_receipts');
    expect(migration).toContain('public.studio2_complete_domain_event_delivery');
    expect(migration).toContain(
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

  it('proves the System contract on clean replay and current-main upgrade without hosted mutation', () => {
    expect(rehearsal).toContain('bun run scripts/check-v3-production-isolation.ts');
    expect(rehearsal).toContain('private.v3_publication_result_version_release_ready');
    expect(rehearsal).toContain("studio2_normalise_publication_config('{\\\"results\\\":true}'::jsonb)");
    expect(rehearsal).toContain('private.v3_edition_final_results_ready');
    expect(rehearsal).toContain("'results',null,null,7");
    expect(rehearsal).toContain("'post_edition',null,null,8");
    expect(rehearsal).toContain("'archived',null,null,9");
    expect(rehearsal).toContain('studio2_claim_domain_event_deliveries');
    expect(rehearsal).toContain('studio2_process_edition_domain_event');
    expect(rehearsal).toContain("status='suppressed'");
    expect(rehearsal).toContain('immutable result snapshot changed during archive');
    expect(rehearsal).toContain('a pre-existing operation receipt was lost');

    expect(workflow).toContain('supabase db reset --local --no-seed');
    expect(workflow).toContain('supabase migration up --local --include-all');
    expect(workflow).toContain('.github/scripts/v3-s14-archive-system-rehearsal.sh');
  });
});
