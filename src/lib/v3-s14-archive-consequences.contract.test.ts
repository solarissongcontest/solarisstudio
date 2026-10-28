import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql',
  'utf8',
);
const readinessHardening = readFileSync(
  'supabase/migrations/20261019112200_v3_s14_final_results_readiness_hardening.sql',
  'utf8',
);
const transitionNormalization = readFileSync(
  'supabase/migrations/20261019112300_v3_s14_transition_http409.sql',
  'utf8',
);
const taskAlignment = readFileSync(
  'supabase/migrations/20261019112400_v3_s14_archive_task_registry_alignment.sql',
  'utf8',
);
const notificationInvariant = readFileSync(
  'supabase/migrations/20261019112500_v3_s14_resolved_task_notification_invariant.sql',
  'utf8',
);
const deliveryReconciliation = readFileSync(
  'supabase/migrations/20261019202636_v3_s14_resolved_task_delivery_reconciliation.sql',
  'utf8',
);
const archiveInvariantFixes = readFileSync(
  'supabase/migrations/20261020130000_v3_s14_archive_invariant_forward_fixes.sql',
  'utf8',
);
const archiveGuardAuthorityFix = readFileSync(
  'supabase/migrations/20261021110000_v3_s14_archive_guard_authority_forward_fix.sql',
  'utf8',
);
const rehearsal = readFileSync('.github/scripts/v3-s14-archive-system-rehearsal.sh', 'utf8');
const guardRehearsal = readFileSync('.github/scripts/v3-s14-archive-guard-rehearsal.sh', 'utf8');
const eventRehearsal = readFileSync(
  '.github/scripts/v3-s14-edition-event-vocabulary-rehearsal.sh',
  'utf8',
);
const resurrectionRehearsal = readFileSync(
  '.github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh',
  'utf8',
);
const workflow = readFileSync('.github/workflows/v3-s14-archive-system-rehearsal.yml', 'utf8');
const controlRoom = readFileSync('src/lib/studio2-control-room.ts', 'utf8');
const client = readFileSync('src/lib/v3-edition-transition-client.ts', 'utf8');

const migrations = [
  migration,
  readinessHardening,
  transitionNormalization,
  taskAlignment,
  notificationInvariant,
  deliveryReconciliation,
  archiveInvariantFixes,
  archiveGuardAuthorityFix,
];

describe('System V3 S14 archive consequence contract', () => {
  it('adopts every S14 database change through the S13 forward-fix contract', () => {
    for (const source of migrations) {
      expect(source).toContain('insert into private.v3_migration_contracts');
      expect(source).toContain("'forward_fix_only'");
    }
    expect(migration).toContain("'v3.s14.archive-consequence-reconciliation'");
    expect(readinessHardening).toContain("'v3.s14.final-results-readiness-hardening'");
    expect(transitionNormalization).toContain("'v3.s14.transition-http409'");
    expect(taskAlignment).toContain("'v3.s14.archive-task-registry-alignment'");
    expect(notificationInvariant).toContain("'v3.s14.resolved-task-notification-invariant'");
    expect(deliveryReconciliation).toContain(
      "'v3.s14.resolved-task-delivery-reconciliation'",
    );
    expect(archiveInvariantFixes).toContain(
      "'v3.s14.archive-invariant-forward-fixes'",
    );
    expect(archiveGuardAuthorityFix).toContain(
      "'v3.s14.archive-guard-authority-forward-fix'",
    );
  });

  it('keeps one versioned edition runtime authority and fences direct Archive mutation', () => {
    expect(migration).toContain('public.studio2_edition_runtime');
    expect(migration).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
    expect(migration).not.toMatch(/update public\.editions\s+set\s+status\s*=/i);
    expect(migration).toContain('create or replace function public.studio2_transition_edition_v3(');
    expect(migration).toContain('p_expected_version bigint');
    expect(migration).toContain('p_operation_id uuid');
    expect(migration).toContain('p_idempotency_key text');
    expect(migration).toContain('private.studio2_claim_operation(');
    expect(migration).toContain('private.studio2_complete_operation(p_operation_id, v_result)');
    expect(migration).toContain('private.v3_guard_archive_runtime_transition');
    expect(archiveGuardAuthorityFix).toContain(
      'private.v3_archive_runtime_transition_gates',
    );
    expect(archiveGuardAuthorityFix).toContain(
      'private.v3_arm_archive_runtime_transition_gate(p_edition_id)',
    );
    expect(archiveGuardAuthorityFix).toContain('transaction_id = txid_current()');
    expect(archiveGuardAuthorityFix).toContain(
      'alter function public.studio2_transition_edition_v3(',
    );
    expect(archiveGuardAuthorityFix).not.toContain('current_setting(');
    expect(archiveInvariantFixes).toContain("old.state = 'archived'");
    expect(archiveInvariantFixes).toContain("Archived edition runtime is irreversible.");
    expect(migration).toContain(
      'revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)',
    );
  });

  it('reconciles coarse multi-show runtime to Results only from exact public result evidence', () => {
    expect(migration).toContain("and p_to = 'results'");
    expect(migration).toContain('private.v3_edition_final_results_ready(p_edition_id)');
    expect(migration).toContain('v_reconciled_final_results := true');
    expect(readinessHardening).toContain("in ('grand-final', 'final')");
    expect(readinessHardening).toContain("control.state = 'public'");
    expect(readinessHardening).toContain(
      'private.studio2_normalise_publication_config(control.frozen_config)',
    );
    expect(readinessHardening).toContain("->> 'results'");
    expect(readinessHardening).toContain('join private.v3_result_versions result_version');
    expect(readinessHardening).toContain('result_version.result_row_count > 0');
    expect(readinessHardening).toContain('private.v3_publication_result_version_release_ready(');
  });

  it('emits canonical lifecycle/archive events with replay-safe consequences', () => {
    expect(migration).toContain("'edition.archived'");
    expect(migration).toContain('private.v3_emit_domain_event(');
    expect(migration).toContain("array['edition.tasks']::text[]");
    expect(migration).toContain('create or replace function public.studio2_process_edition_domain_event(');
    expect(migration).toContain('private.v3_domain_event_consumer_receipts');
    expect(migration).toContain('public.studio2_complete_domain_event_delivery');
    expect(transitionNormalization).toContain("'''PT409'''");
    expect(transitionNormalization).toContain("'edition.transitioned'");
    expect(eventRehearsal).toContain("event_type='edition.transitioned'");
    expect(eventRehearsal).toContain("event_type='edition.state_changed'");
    expect(eventRehearsal).toContain("type='edition.state_changed'");
  });

  it('makes archived current-workflow task resolution a non-resurrectable database invariant', () => {
    expect(taskAlignment).toContain('create or replace function private.v3_archive_task_type_is_current_workflow(');
    expect(taskAlignment).toContain("= 'edition.blocker'");
    expect(taskAlignment).toContain('private.v3_archive_task_type_is_current_workflow(task.task_type)');
    expect(taskAlignment).toContain('create trigger v3_guard_archived_edition_task_resurrection');
    expect(taskAlignment).toContain('before insert or update on public.studio2_organizer_tasks');
    expect(taskAlignment).toContain("runtime.state = 'archived'");
    expect(taskAlignment).not.toMatch(/p_task_type[^\n]*(incident|integrity)/);
    expect(archiveInvariantFixes).toContain('old.resolved_at, new.resolved_at, now()');
    expect(archiveGuardAuthorityFix).toContain('to_jsonb(new) - array');
    expect(archiveGuardAuthorityFix).toContain('for no key update');
    expect(guardRehearsal).toContain('archive left canonical edition.blocker actionable');
    expect(resurrectionRehearsal).toContain('archived edition.blocker was resurrected');
    expect(resurrectionRehearsal).toContain('new impossible archived-edition task became actionable');
  });

  it('makes resolved Task Inbox and undelivered push state canonical rather than call-order dependent', () => {
    expect(notificationInvariant).toContain("requires_action = task.state <> 'resolved'");
    expect(notificationInvariant).toContain(
      'create or replace function private.v3_project_resolved_task_delivery_state()',
    );
    expect(notificationInvariant).toContain("status = 'suppressed'");
    expect(notificationInvariant).toContain(
      'after insert or update of state, resolved_at on public.studio2_organizer_tasks',
    );
    expect(deliveryReconciliation).toContain(
      'create or replace function private.v3_reconcile_resolved_task_notifications',
    );
    expect(deliveryReconciliation).toContain('update public.notification_deliveries delivery');
    expect(deliveryReconciliation).toContain("delivery.status in ('pending', 'processing')");
    expect(deliveryReconciliation).not.toContain(
      "delivery.status in ('pending', 'processing', 'failed')",
    );
    expect(deliveryReconciliation).toContain(
      'Failed attempts are immutable failure evidence and are left in',
    );
    expect(archiveInvariantFixes).toContain('private.studio2_prune_stale_task_notifications(p_edition_id)');
    expect(guardRehearsal).toContain('canonical edition.blocker Inbox projection was not actionable before archive');
    expect(guardRehearsal).toContain('archive left edition.blocker Inbox projection actionable');
    expect(resurrectionRehearsal).toContain('task resolution did not immediately repair poisoned Inbox action state');
    expect(resurrectionRehearsal).toContain('task resolution did not immediately suppress pending delivery state');
    expect(resurrectionRehearsal).toContain('task resolution rewrote historical failed-delivery evidence');
  });

  it('retains task/notification/history evidence while ending false current action state', () => {
    expect(migration).toContain('private.v3_reconcile_resolved_task_notifications');
    expect(notificationInvariant).not.toMatch(/delete\s+from\s+public\.admin_notifications/i);
    expect(notificationInvariant).not.toMatch(/delete\s+from\s+public\.notification_deliveries/i);
    expect(rehearsal).toContain('immutable result snapshot changed during archive');
    expect(rehearsal).toContain('publication provenance changed during archive');
    expect(rehearsal).toContain('a pre-existing operation receipt was lost');
    expect(rehearsal).toContain("== 'suppressed'");
  });

  it('binds browser success to the exact reviewed operation receipt', () => {
    expect(controlRoom).toContain('const reviewedRuntimeVersions = new Map<string, number>()');
    expect(controlRoom).toContain('reviewedRuntimeVersions.set(editionId, snapshot.runtime.version)');
    expect(controlRoom).toContain(
      'request.expectedVersion ?? reviewedRuntimeVersions.get(request.editionId) ?? null',
    );
    expect(client).toContain("client.rpc('studio2_transition_edition_v3'");
    expect(client).toContain("'studio2_reconcile_operation'");
    expect(client).toContain('operationId !== request.operationId');
    expect(client).toContain('previousRuntimeVersion !== request.expectedVersion');
    expect(client).toContain('runtimeVersion !== request.expectedVersion + 1');
  });

  it('proves clean replay and exact current-main + S14 delta without hosted mutation', () => {
    for (const script of [rehearsal, guardRehearsal, eventRehearsal, resurrectionRehearsal]) {
      expect(script).toContain('Refusing hosted Supabase rehearsal');
      expect(script).toContain('bun run scripts/check-v3-production-isolation.ts');
      expect(script).not.toMatch(/supabase\.co/i);
    }
    expect(rehearsal).toContain("'edition.manage'");
    expect(rehearsal).toContain("'edition.transition'");
    expect(rehearsal).toContain("'edition.archive'");
    expect(workflow).toContain('supabase db reset --local --no-seed');
    // The upgrade must now include every candidate migration, not only the
    // original Archive list: later grant cutovers are part of runtime authority.
    expect(workflow).toContain('bash "$GITHUB_WORKSPACE/.github/scripts/v3-copy-migration-delta.sh" "$GITHUB_WORKSPACE" /tmp/solaris-s14-main origin/main');
    const delta = readFileSync('.github/scripts/v3-copy-migration-delta.sh', 'utf8');
    expect(delta).toContain('diff --name-only --diff-filter=AM "$BASE_REF"...HEAD');
    expect(delta).toContain("'supabase/migrations/*.sql'");
    expect(delta).toContain('feature branch deletes migration files; upgrade rehearsal refuses destructive migration history');
    expect(delta).toContain('cmp -s "$source_path" "$target_path"');
    expect(workflow).toContain('supabase migration up --local --include-all');
    expect(workflow).not.toContain('rsync');
    expect(workflow).toContain('.github/scripts/v3-s14-edition-event-vocabulary-rehearsal.sh');
    expect(workflow).toContain('.github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh');
  });
});
