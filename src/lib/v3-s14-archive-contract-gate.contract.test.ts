import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gate = readFileSync('scripts/check-v3-s14-archive-contract.ts', 'utf8');
const readiness = readFileSync('scripts/check-v3-s14-rehearsal-readiness.ts', 'utf8');

describe('S14 Archive transition release gate', () => {
  it('requires viewed runtime version plus stable caller operation identity', () => {
    expect(gate).toContain('expected-runtime-version');
    expect(gate).toContain('stable-operation-identity');
    expect(gate).toContain('stable-idempotency-key');
    expect(gate).toContain('p_expected_version');
    expect(gate).toContain('p_operation_id');
    expect(gate).toContain('p_idempotency_key');
    expect(gate).toContain('src/lib/studio2-persistence.ts');
  });

  it('requires durable operation completion, reconciliation and legacy bypass protection', () => {
    expect(gate).toContain('server-operation-ledger');
    expect(gate).toContain('studio2_claim_operation');
    expect(gate).toContain('studio2_complete_operation');
    expect(gate).toContain('transport-reconciliation');
    expect(gate).toContain('studio2_reconcile_operation');
    expect(gate).toContain('legacy-archive-bypass-blocked');
    expect(gate).toContain('v3_guard_archive_runtime_transition');
    expect(gate).toContain("if (request.to !== 'archived')");
  });

  it('keeps the Archive contract visible in normal S14 readiness evidence', () => {
    expect(readiness).toContain('check-v3-s14-archive-contract.ts');
    expect(readiness).toContain('archiveTransitionContract');
    expect(readiness).toContain('S14 Archive transition is blocked');
    expect(readiness).toContain('legacy-bypass protection');
  });

  it('reports READY only from the concrete stacked System command implementation', () => {
    const output = execFileSync('bun', ['run', 'scripts/check-v3-s14-archive-contract.ts', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const report = JSON.parse(output) as {
      ready: boolean;
      blockers: string[];
      transitionConsumer: string;
      archiveCommandMigrations: string[];
      archiveGuardMigrations: string[];
    };
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.transitionConsumer).toBe('src/lib/studio2-persistence.ts');
    expect(report.archiveCommandMigrations).toContain(
      'supabase/migrations/20261017003200_v3_s14_archive_command_integrity.sql',
    );
    expect(report.archiveGuardMigrations).toContain(
      'supabase/migrations/20261017003200_v3_s14_archive_command_integrity.sql',
    );
  });
});
