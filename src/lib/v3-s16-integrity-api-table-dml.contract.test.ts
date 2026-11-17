import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const migration = readFileSync('supabase/migrations/20261117071000_v3_s16_integrity_api_table_dml_retirement.sql','utf8');
const sql = readFileSync('.github/tests/v3-s16-integrity-api-table-dml.sql','utf8');
const catalog = readFileSync('.github/scripts/v3-s16-catalog-rehearsal.sh','utf8');
const publication = readFileSync('.github/workflows/v3-s14-archive-forward-effects-local.yml','utf8');
const rules = readFileSync('.github/scripts/rules-integrity-security-rehearsal.sh','utf8');

const targets = ["public.integrity_cases","public.integrity_case_events","public.integrity_case_appeals","public.integrity_case_evidence"];
describe('S16 P04 Integrity service-role DML separation',()=>{
  it('qualifies precise owner RPCs and requires RLS for all four sensitive tables',()=>{
    for(const table of targets){
      expect(migration).toContain(table);
      expect(migration).toContain('c.relrowsecurity');
      expect(sql).toContain(table);
    }
    expect(migration).toContain('pg_get_userbyid(v_procedure.proowner)');
    expect(migration).toContain("v_procedure.prosecdef");
    expect(migration).toContain('v3_register_migration_contract');
  });
  it('proves actual 48 API-role insert/update/delete/truncate ACL denials',()=>{
    for(const role of ['anon','authenticated','service_role']){
      expect(sql).toContain('set local role '+role+';');
      expect(sql).toContain('16 Integrity API-table DML denials for '+role);
    }
    for(const verb of ['insert','update','delete','truncate'])
      expect(sql).toMatch(new RegExp(verb+'.*%s','i'));
    expect(sql).toContain('permission denied for table ');
    expect((migration.match(/revoke insert,update,delete,truncate,references,trigger,maintain/g)||[]).length).toBe(4);
    expect(migration).not.toMatch(/drop trigger|disable trigger|drop function|disable row level security/i);
  });
  it('keeps real authorized case/report/appeal/evidence browser and PG17 acceptance',()=>{
    expect(rules).toContain('public_create_anonymous_integrity_case');
    expect(rules).toContain('admin_record_integrity_finding');
    expect(rules).toContain('reporter_submit_integrity_appeal');
    expect(catalog).toContain('v3-s16-integrity-api-table-dml.sql');
    expect(publication).toContain('20261117071000_v3_s16_integrity_api_table_dml_retirement.sql');
  });
});
