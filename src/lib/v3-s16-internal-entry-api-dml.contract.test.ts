import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const sql=readFileSync('.github/tests/v3-s16-internal-entry-api-dml.sql','utf8');
const migration=readFileSync('supabase/migrations/20261117151000_v3_s16_internal_entry_api_dml_retirement.sql','utf8');
const catalog=readFileSync('.github/scripts/v3-s16-catalog-rehearsal.sh','utf8');
const s14=readFileSync('.github/workflows/v3-s14-archive-forward-effects-local.yml','utf8');
const review=readFileSync('.github/scripts/v3-confirmation-maintenance-nf-winner-rehearsal.sh','utf8');
describe('S16 P14 internal Entry review ACL',()=>{
  it('requires real existing Entry review CAS/receipt owner and enabled version guards',()=>{
    for(const v of ['public.studio2_apply_confirmation_entry_review','p_expected_version','p_expected_entry_version','private.studio2_claim_operation','studio2_guard_internal_entry_review_transition','studio2_touch_internal_entry_review_version'])
      expect(migration).toContain(v);
    expect(migration).not.toMatch(/drop trigger|disable trigger|drop function|disable row level security/i);
  });
  it('denies 12 actual role DML attempts while preserving canonical read and RPC',()=>{
    expect(migration).toMatch(/revoke insert,update,delete,truncate,references,trigger,maintain\s+on table public\.internal_entries from public,anon,authenticated,service_role/i);
    for(const role of ['anon','authenticated','service_role']){
      expect(sql).toContain('set local role '+role+';');
      expect(sql).toContain('4 internal Entry SQL denials for '+role);
    }
    expect(sql).toContain('permission denied for table internal_entries');
    expect(sql).toContain('canonical revision-scoped Entry review remains available');
  });
  it('is exercised in isolated S16 and exact-SHA Entry/Confirmation/S14 stateful evidence',()=>{
    expect(catalog).toContain('v3-s16-internal-entry-api-dml.sql');
    expect(s14).toContain('20261117151000_v3_s16_internal_entry_api_dml_retirement.sql');
    expect(review).toContain('studio2_apply_confirmation_entry_review');
  });
});