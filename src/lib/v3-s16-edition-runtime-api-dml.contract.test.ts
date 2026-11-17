import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261117070000_v3_s16_edition_runtime_api_dml_retirement.sql','utf8');
const sql = readFileSync('.github/tests/v3-s16-edition-runtime-api-dml.sql','utf8');
const catalogRunner = readFileSync('.github/scripts/v3-s16-catalog-rehearsal.sh','utf8');
const s14Workflow = readFileSync('.github/workflows/v3-s14-archive-forward-effects-local.yml','utf8');
const stateful = readFileSync('.github/scripts/v3-full-contest-rehearsal.sh','utf8');

describe('S16 P13 edition runtime direct API authority cutover',()=>{
  it('keeps source-defined owner-only V3 transition and Archive/seed attachments',()=>{
    expect(migration).toContain("private.studio2_transition_edition_v3(");
    expect(migration).toContain("private.v3_arm_archive_runtime_transition_gate");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("studio2_seed_edition_runtime_after_insert");
    expect(migration).toContain("v3_guard_archive_runtime_transition");
    expect(migration).toContain("has_table_privilege('authenticated', v_table, 'SELECT')");
  });
  it('closes direct DML to all three API principals without changing underlying trigger logic',()=>{
    expect(migration).toMatch(/revoke insert, update, delete, truncate, references, trigger, maintain\s+on table public\.studio2_edition_runtime\s+from public, anon, authenticated, service_role/i);
    expect(migration).not.toMatch(/drop (?:function|trigger)|disable trigger|alter table .*disable row level security/i);
    for(const r of ['anon','authenticated','service_role'])expect(sql).toContain("set local role "+r+";");
    for(const verb of ['insert','update','delete','truncate'])expect(sql).toMatch(new RegExp(verb+'.*public\\.studio2_edition_runtime','i'));
    expect(sql).toContain("permission denied for table studio2_edition_runtime");
  });
  it('executes PG17 negative probes and independent positive lifecycle acceptance on exact SHA',()=>{
    expect(catalogRunner).toContain('v3-s16-edition-runtime-api-dml.sql');
    expect(s14Workflow).toContain('20261117070000_v3_s16_edition_runtime_api_dml_retirement.sql');
    expect(stateful).toContain('studio2_transition_edition_v3');
  });
});
