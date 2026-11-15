import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const migration='supabase/migrations/20261115084647_v3_jury_canonical_table_authority.sql';
const sql=fs.readFileSync(migration,'utf8');
const observed=JSON.parse(fs.readFileSync('docs/v3/recovery-candidates/evidence/jury-table-authority-observed-2026-11-15.json','utf8'));
test('every qualified Jury command matches the fresh catalog authority evidence',()=>{
 const qualified=[...sql.matchAll(/jsonb_array_elements\('([\s\S]*?)'::jsonb\)/g)].map(m=>JSON.parse(m[1]));
 const routines=qualified.find(list=>list[0].sha256);
 assert.equal(routines.length,5);
 for(const routine of routines){
  const o=observed.routines.find(x=>x.identity===routine.identity);
  assert.ok(o?.exists,routine.identity);
  for(const key of ['owner','securityDefiner','config','acl','sha256']) assert.deepEqual(routine[key],o[key],routine.identity+':'+key);
 }
 const tables=qualified.find(list=>list[0].rls!==undefined);
 assert.equal(tables.length,7);
 for(const table of tables){const o=observed.tables.find(x=>x.identity===table.identity);assert.ok(o?.exists);for(const key of ['owner','rls','forceRls'])assert.deepEqual(table[key],o[key]);}
 assert.equal(observed.projectRef,'dkxmnvekiopyesuzggeu');
 assert.equal(observed.applicationRowsRead,false);
});
test('ordered recovery and runtime evidence include the actual cutover',()=>{
 const driver=fs.readFileSync('.github/scripts/v3-auth-jury-authority-local.sh','utf8');
 assert.ok(driver.includes('operator_apply '+migration));
 assert.ok(driver.indexOf('operator_apply '+migration)<driver.indexOf('client_sql -f - < .github/tests/v3-jury-governed-cutover-runtime.sql'));
 assert.ok(driver.includes('v3-jury-governed-cutover-role-denial.sql'));
 assert.ok(fs.readFileSync('.github/scripts/v3-observed-owner-recovery-local.sh','utf8').includes("'"+migration+"'"));
});
