import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {stageConfirmationRecovery,SOURCES,EVIDENCE} from './stage-v3-confirmation-access-recovery.mjs';

test('frozen source effects form one atomic guarded recovery, not five unchecked migrations',()=>{
  const sql=stageConfirmationRecovery();
  assert.match(sql,/\\set ON_ERROR_STOP on/);
  assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
  assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
  assert.equal((sql.match(/select public\.v3_register_migration_contract\(/g)||[]).length,5);
  assert.ok(sql.indexOf('Confirmation function definition/ACL drift')<sql.indexOf('v3.confirmation.exact-edition-reads'));
  assert.ok(sql.indexOf('v3.confirmation.response-access-commands')<sql.indexOf('v3.confirmation.retire-legacy-response-writes'));
  assert.ok(sql.indexOf('v3.confirmation.retire-legacy-response-writes')<sql.indexOf('v3.confirmation.governed-readonly-compat'));
  assert.ok(sql.indexOf('v3.confirmation.governed-readonly-compat')<sql.indexOf('v3.confirmation.legacy-writers-owner-only'));
  for(const [path] of SOURCES) assert.ok(sql.includes('-- Source '+path));
  assert.match(sql,/Legacy Confirmation writer still accessible/);
  assert.match(sql,/columnShapeMd5/);
  assert.match(sql,/policyMd5/);
  assert.match(sql,/pg_attribute/);
  assert.match(sql,/pg_policy/);
  assert.match(sql,/already\/partially installed/);
  assert.doesNotMatch(sql,/insert into supabase_migrations|disable row level security/i);
});

test('the CLI emits the exact staging artifact without network or production tooling',()=>{
  const fromCli=execFileSync('node',['scripts/stage-v3-confirmation-access-recovery.mjs'],{encoding:'utf8'});
  assert.equal(fromCli,stageConfirmationRecovery());
  assert.doesNotMatch(readFileSync('scripts/stage-v3-confirmation-access-recovery.mjs','utf8'),/connect\(|fetch\(|https?:\/\/|execute_sql|apply_migration/i);
});
function copyRoot(){
  const root=mkdtempSync(join(tmpdir(),'solaris-confirmation-stage-'));
  for(const p of [EVIDENCE,...SOURCES.map(x=>'supabase/migrations/'+x[0])]){
    mkdirSync(dirname(join(root,p)),{recursive:true});
    copyFileSync(p,join(root,p));
  }
  return root;
}
test('unexpected hosted evidence, unsupported partial effects and source drift fail without an artifact',()=>{
  for(const change of [
    d=>d.projectRef='unknown-project',
    d=>d.existingFunctions.pop(),
    d=>d.existingFunctions[0].definitionMd5='00000000000000000000000000000000',
    d=>d.existingTables[0].columnShapeMd5='not-a-fingerprint',
    d=>d.existingTables[0].policyMd5='not-a-fingerprint',
    d=>d.s13FoundationAbsent=false,
    d=>d.applicationRowsRead=true,
  ]){
    const root=copyRoot();
    try{
      const p=resolve(root,EVIDENCE), d=JSON.parse(readFileSync(p,'utf8'));
      change(d);writeFileSync(p,JSON.stringify(d));
      if(d.existingFunctions?.length===10 && d.projectRef==='dkxmnvekiopyesuzggeu' &&
         d.s13FoundationAbsent && !d.applicationRowsRead &&
         d.existingTables.every(x=>/^[0-9a-f]{32}$/.test(x.columnShapeMd5)&&/^[0-9a-f]{32}$/.test(x.policyMd5))){
        // A changed but well-formed evidence hash is not self-authenticating;
        // the SQL catalog comparison MUST independently refuse it at execution.
        assert.match(stageConfirmationRecovery(root),/definitionMd5/);
      } else assert.throws(()=>stageConfirmationRecovery(root),/Unqualified|Invalid Confirmation authority fingerprints/);
    }finally{rmSync(root,{force:true,recursive:true});}
  }
  const root=copyRoot();
  try{
    const p=resolve(root,'supabase/migrations',SOURCES[0][0]);
    writeFileSync(p,readFileSync(p,'utf8')+'\n-- drift');
    assert.throws(()=>stageConfirmationRecovery(root),/Unreviewed immutable Confirmation SQL/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
