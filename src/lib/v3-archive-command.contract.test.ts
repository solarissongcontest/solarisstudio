import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261017003200_v3_s14_archive_command_integrity.sql',
  'utf8',
);
const commandClient = readFileSync('src/lib/v3-archive-command.ts', 'utf8');
const controlRoom = readFileSync('src/lib/studio2-control-room.ts', 'utf8');
const route = readFileSync('src/routes/_authenticated/admin/control-room.tsx', 'utf8');

describe('System V3 S14 canonical Archive command', () => {
  it('requires caller-owned optimistic and idempotency identity', () => {
    expect(migration).toContain('p_expected_version bigint');
    expect(migration).toContain('p_operation_id uuid');
    expect(migration).toContain('p_idempotency_key text');
    expect(migration).toContain('private.studio2_claim_operation(');
    expect(migration).toContain("'expectedRuntimeVersion', p_expected_version");
    expect(migration).toContain('v_runtime.version is distinct from p_expected_version');
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
  });

  it('keeps the canonical operation and archive event in one transaction', () => {
    expect(migration).toContain("'edition.transition.archived'");
    expect(migration).toContain('private.studio2_complete_operation(p_operation_id, v_result)');
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'edition.archived'");
    expect(migration).toContain("array['edition.tasks']::text[]");
    expect(migration).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
  });

  it('blocks legacy archive writes at the canonical runtime boundary', () => {
    expect(migration).toContain('private.v3_guard_archive_runtime_transition');
    expect(migration).toContain("current_setting('solaris.v3_archive_command', true)");
    expect(migration).toContain("set_config('solaris.v3_archive_command', 'allowed', true)");
    expect(migration).toContain('before update of state on public.studio2_edition_runtime');
  });

  it('reconciles a lost browser response exactly once', () => {
    expect(commandClient).toContain("client.rpc('studio2_archive_edition_v3'");
    expect(commandClient).toContain('p_expected_version: request.expectedVersion');
    expect(commandClient).toContain('p_operation_id: request.operationId');
    expect(commandClient).toContain('p_idempotency_key: request.idempotencyKey');
    expect(commandClient).toContain("client.rpc('studio2_reconcile_operation'");
    expect(commandClient).toContain("receipt.status === 'succeeded'");
  });

  it('binds the archive command to the runtime version the organizer actually viewed', () => {
    expect(route).toContain('const expectedVersion = snapshotQuery.data?.runtime.version');
    expect(route).toContain('const operationId = crypto.randomUUID()');
    expect(route).toContain('expectedVersion,');
    expect(route).toContain('operationId,');
    expect(route).toContain('idempotencyKey: `edition-transition:${operationId}`');
    expect(controlRoom).toContain("if (request.to === 'archived')");
    expect(controlRoom).toContain('return archiveCommand({');
  });
});
