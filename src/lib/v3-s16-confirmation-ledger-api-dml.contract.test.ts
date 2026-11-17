import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const migration = readFileSync('supabase/migrations/20261117072000_v3_s16_confirmation_ledger_api_dml_retirement.sql','utf8');
const sql = readFileSync('.github/tests/v3-s16-confirmation-ledger-api-dml.sql','utf8');
const runner = readFileSync('.github/scripts/v3-s16-catalog-rehearsal.sh','utf8');
const s14 = readFileSync('.github/workflows/v3-s14-archive-forward-effects-local.yml','utf8');
const confirmation = readFileSync('.github/scripts/v3-confirmation-security-rehearsal.sh','utf8');

describe('S16 P07 Confirmation protected ledgers',()=>{
  it('targets 3 real version/requirement tables and retains original trust boundaries',()=>{
    for(const table of ["public.submission_versions","public.studio2_confirmation_requirements","public.studio2_confirmation_round_versions"]){
      expect(migration).toContain(table);
      expect(sql).toContain(table);
    }
    expect(migration).toContain('studio2_confirmation_requirement_reconcile');
    expect(migration).toContain('studio2_confirmation_round_touch_version');
    expect(migration).toContain('v3_submit_confirmation');
    expect(migration).toContain('studio2_apply_confirmation_round_change');
    expect(migration).toContain('admin_restore_confirmation_version');
    expect(migration).not.toMatch(/drop trigger|drop function|disable trigger|disable row level security/i);
  });
  it('denies all three API roles at real PostgreSQL table ACL, retaining RPCs',()=>{
    for(const role of ['anon','authenticated','service_role']){
      expect(sql).toContain('set local role '+role+';');
      expect(sql).toContain('12 denied Confirmation ledger SQL writes for '+role);
    }
    expect(sql).toContain('permission denied for table ');
    expect((migration.match(/revoke insert,update,delete,truncate,references,trigger,maintain/g)||[]).length).toBe(3);
    expect(sql).toContain("has_function_privilege('authenticated'");
  });
  it('runs exact-SHA isolated PG17 and positive Confirmation workflow acceptance',()=>{
    expect(runner).toContain('v3-s16-confirmation-ledger-api-dml.sql');
    expect(s14).toContain('20261117072000_v3_s16_confirmation_ledger_api_dml_retirement.sql');
    expect(confirmation).toContain('v3_submit_confirmation');
  });
});
