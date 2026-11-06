import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ALIGNMENT, eligibleMigration, blankComments,
  scanOfficeTermSql, auditOfficeTermMigrations
} from './check-v3-world-office-schema-compat.mjs';

const PATH='supabase/migrations/20261107120000_world_contract.sql';

test('TG2 canonical alignment stays fixed',()=>{
  assert.equal(ALIGNMENT,'20261102171700');
  assert.equal(eligibleMigration('supabase/migrations/20261102171600_legacy.sql'),false);
  assert.equal(eligibleMigration('supabase/migrations/20261102171700_alignment.sql'),false);
  assert.equal(eligibleMigration(PATH),true);
  assert.throws(()=>eligibleMigration('../secrets.sql'),/Not a migration/);
  assert.throws(()=>eligibleMigration('supabase/migrations/../../bad.sql'),/Unsafe/);
});

test('finds stale office term alias fields, but not representative terms',()=>{
  const sql=[
    'create function f() returns void as $$',
    'begin',
    ' select term.starts_at from public.world_office_terms as term;',
    ' select term.ends_at from public.world_office_terms term;',
    ' select representative.starts_at from public.world_representative_terms representative;',
    'end $$ language plpgsql;'
  ].join('\n');
  const r=scanOfficeTermSql(sql,PATH);
  assert.deepEqual(r.map(x=>x.line),[3,4]);
  assert.deepEqual(r.map(x=>x.code),['stale_office_term_field','stale_office_term_field']);
  assert.match(r[0].detail,/started_at/);
  assert.match(r[1].detail,/actual_end_at/);
});

test('detects the broken TG4 SELECT INTO row contract',()=>{
  const sql=[
    'create or replace function private.world_document_actor_person_v1()',
    'returns uuid as $$',
    'declare term_row record;',
    'begin',
    ' select * into term_row from public.world_office_terms where status = ''active'';',
    ' if term_row.starts_at > now() or term_row.ends_at is not null then return null; end if;',
    ' return term_row.holder_person_id;',
    'end $$ language plpgsql;'
  ].join('\n').replace("''active''","'active'");
  assert.deepEqual(scanOfficeTermSql(sql,PATH).map(x=>x.line),[6,6]);
});

test('detects direct DML target names',()=>{
  const sql=[
    'insert into public.world_office_terms (id, starts_at, status) values (x, now(), ''active'');',
    'update public.world_office_terms set ends_at=now() where id=x;'
  ].join('\n').replace("''active''","'active'");
  assert.deepEqual(scanOfficeTermSql(sql,PATH).map(x=>x.code),
    ['stale_office_term_insert_column','stale_office_term_update_column']);
});

test('canonical SQL and commented legacy code pass',()=>{
  const sql=[
    '-- select t.starts_at from public.world_office_terms t',
    '/* update public.world_office_terms set ends_at=now(); */',
    'select t.started_at, t.actual_end_at from public.world_office_terms t',
    'where t.started_at<=now() and t.actual_end_at is null;'
  ].join('\n');
  assert.equal(scanOfficeTermSql(sql,PATH).length,0);
  assert.equal(blankComments(sql).split('\n').length,sql.split('\n').length);
});

test('alias from a different function is not attributed to office terms',()=>{
  const sql=[
    'create function a() returns void as $$ begin select t.started_at from world_office_terms t; end $$ language plpgsql;',
    'create function b() returns void as $$ begin select t.starts_at from world_representative_terms t; end $$ language plpgsql;'
  ].join('\n');
  assert.deepEqual(scanOfficeTermSql(sql,PATH),[]);
});

test('audit does not declare passing evidence with no eligible SQL',()=>{
  assert.throws(()=>auditOfficeTermMigrations([]),/No migrations/);
  assert.throws(()=>auditOfficeTermMigrations([{path:PATH}]),/SQL unavailable/);
  assert.throws(()=>auditOfficeTermMigrations([{path:'supabase/migrations/20261102171600_old.sql',content:'select 1'}]),/No post-alignment/);
  const report=auditOfficeTermMigrations([{path:PATH,content:'select t.starts_at from world_office_terms t;'}]);
  assert.equal(report.status,'fail');
  assert.match(report.caveat,/No database execution/);
});

test('CLI executes offline, fails on schema drift, passes canonical SQL and rejects absent git refs',()=>{
  const root=mkdtempSync(join(tmpdir(),'world-office-schema-'));
  try{
    const file=join(root,PATH);
    mkdirSync(join(root,'supabase/migrations'),{recursive:true});
    const cli=join(import.meta.dirname,'check-v3-world-office-schema-compat.mjs');
    const run=()=>spawnSync(process.execPath,[cli,'--root',root,'--file',PATH],{encoding:'utf8'});
    writeFileSync(file,'select t.starts_at from world_office_terms t;');
    const fail=run();
    assert.equal(fail.status,1,fail.stderr);
    assert.equal(JSON.parse(fail.stdout).findings[0].code,'stale_office_term_field');
    writeFileSync(file,'select t.started_at from world_office_terms t;');
    const pass=run();
    assert.equal(pass.status,0,pass.stderr);
    assert.equal(JSON.parse(pass.stdout).status,'pass');
    const unknown=spawnSync(process.execPath,[cli,'--root',root,'--base','missing-ref'],{encoding:'utf8'});
    assert.equal(unknown.status,2);
    assert.match(unknown.stderr,/UNVERIFIED/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
