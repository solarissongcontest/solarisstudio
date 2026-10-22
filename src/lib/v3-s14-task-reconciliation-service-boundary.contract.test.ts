import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reconciliationBoundary = readFileSync(
  'supabase/migrations/20261021161000_v3_s14_task_reconciliation_service_boundary.sql',
  'utf8',
);
const archiveAuthority = readFileSync(
  'supabase/migrations/20261021110000_v3_s14_archive_guard_authority_forward_fix.sql',
  'utf8',
);

describe('System V3 S14 task reconciliation service boundary', () => {
  it('keeps the canonical task rebuild system-only', () => {
    expect(reconciliationBoundary).toContain(
      'revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)',
    );
    expect(reconciliationBoundary).toMatch(
      /from public, anon, authenticated;[\s\S]*grant execute on function private\.studio2_reconcile_all_organizer_tasks\(uuid\)[\s\S]*to service_role;/,
    );
    expect(reconciliationBoundary).not.toMatch(
      /grant execute on function private\.studio2_reconcile_all_organizer_tasks\(uuid\)[\s\S]*to (?:public|anon|authenticated)/,
    );
  });

  it('does not reopen the private Archive authority primitives to service_role', () => {
    expect(archiveAuthority).toMatch(
      /revoke all on function private\.v3_arm_archive_runtime_transition_gate\(uuid\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
    expect(archiveAuthority).toMatch(
      /revoke all on function private\.v3_guard_archive_runtime_transition\(\)[\s\S]*from public, anon, authenticated, service_role;/,
    );
  });
});
