import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261024223200_v3_result_reconciliation_hardening.sql'),
  'utf8',
);

describe('V3 Results reconciliation hardening', () => {
  it('is governed by the S13 forward-only migration contract', () => {
    expect(migration).toContain('public.v3_register_migration_contract(');
    expect(migration).toContain("'v3.results.reconciliation-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain('false,\n  null,');
  });

  it('preserves withdrawn and disqualified historical result evidence', () => {
    expect(migration).toContain("coalesce(participant.participation_status, 'confirmed') in ('withdrawn', 'disqualified')");
    expect(migration).toContain("'historicalInactiveResultRowCount'");
    expect(migration).not.toContain('delete from public.results');
  });

  it('makes active-lineup drift explicit instead of comparing every historical row to participant count', () => {
    expect(migration).toContain("'activeResultRowCount'");
    expect(migration).toContain("'missingResultRowCount'");
    expect(migration).toContain("'orphanResultRowCount'");
    expect(migration).toContain("'extraActiveResultRowCount'");
    expect(migration).toContain("'reconciliationConsistent'");
    expect(migration).toContain("'resultReady', coalesce(");
  });

  it('reconciles canonical Jury, Televote, total and rank components independently', () => {
    expect(migration).toContain("submission.status = 'valid'");
    expect(migration).toContain("'juryPointsMismatchCount'");
    expect(migration).toContain("'televotePointsMismatchCount'");
    expect(migration).toContain("'totalPointsMismatchCount'");
    expect(migration).toContain("'rankIssueCount'");
    expect(migration).toContain("v_config ->> 'weightedScoring'");
  });

  it('keeps the established readiness implementation and overlays only stronger Results truth', () => {
    expect(migration).toContain('alter function private.studio2_result_preconditions(uuid)\n  rename to studio2_result_preconditions_v3_base;');
    expect(migration).toContain('v_base := private.studio2_result_preconditions_v3_base(p_show_id);');
    expect(migration).toContain('v_reconciliation := private.studio2_result_reconciliation(p_show_id);');
  });

  it('adds structured fail-closed diagnostics without committing a failed diagnostic recalculation', () => {
    expect(migration).toContain('alter function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint)');
    expect(migration).toContain("when sqlstate '55000' then");
    expect(migration).toContain('get stacked diagnostics v_message = message_text;');
    expect(migration).toContain('detail = v_diagnostics::text');
    expect(migration).toContain('Inspect missing/orphan result rows');
  });

  it('does not expose the wrapped legacy operation implementation as a bypass', () => {
    expect(migration).toContain('revoke all on function public.studio2_execute_result_operation_v3_base(uuid, text, text, uuid, bigint)');
    expect(migration).toContain('from public, anon, authenticated, service_role;');
    expect(migration).toContain('grant execute on function public.studio2_execute_result_operation(uuid, text, text, uuid, bigint)');
  });
});
