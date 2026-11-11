import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compareFifty,S06_FIFTY} from './verify-v3-s06-fifty-relation-parity.mjs';

const path='docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json';
const frozen=JSON.parse(readFileSync(path,'utf8'));
const names=new Set(Object.keys(S06_FIFTY));
const local=()=>({pg_version_num:170011,relations:structuredClone(frozen.relations.filter(x=>names.has(x.schema_name+'.'+x.object_name)))});

test('exactly 50 distinct frozen identities pass full-field verifier without certification',()=>{
 assert.equal(names.size,50);
 const r=compareFifty(frozen,local());
 assert.equal(r.equal,true);
 assert.equal(r.combinedFixtureRelationNamesAfterIntegration,150);
 assert.equal(r.remainingUnmodeledNamesOutside150,65);
 assert.equal(r.fullHostedEquivalenceCertified,false);
 assert.equal(r.productionMigrationAuthorized,false);
});
test('every material catalog field and digest fails closed if drifted',()=>{
 for(const [field,value] of [
 ['acl_md5','0'.repeat(32)],['columns_md5','0'.repeat(32)],
 ['constraints_md5','0'.repeat(32)],['indexes_md5','0'.repeat(32)],
 ['policies_md5','0'.repeat(32)],['triggers_md5','0'.repeat(32)],
 ['column_count',-1],['constraint_count',999],['index_count',99],
 ['policy_count',99],['trigger_count',99],['rls_enabled',false],
 ['rls_forced',true],['owner_name','unknown_role']
 ]) {
   const d=local();d.relations[0][field]=typeof d.relations[0][field]==='boolean' ? !d.relations[0][field] : value;
   try {const r=compareFifty(frozen,d);assert.equal(r.equal,false,field);}catch(e){assert.match(e.message,/S06/,field);}
 }
});
test('unobserved, missing, duplicated, corrupted and stale snapshots cannot pass',()=>{
 for(const mutation of [
  d=>d.relations.pop(),d=>d.relations.push(structuredClone(d.relations[0])),
  d=>d.relations[0].object_name='fake_relation',d=>d.pg_version_num=170012,
  d=>d.relations[0].acl_md5='broken',d=>d.relations[0].unknownField=true
 ]) {const d=local();mutation(d);assert.throws(()=>compareFifty(frozen,d),/S06/);}
 const short=structuredClone(frozen);short.routines.pop();
 assert.throws(()=>compareFifty(short,local()),/S06/);
 const changed=structuredClone(frozen);changed.relations.find(x=>names.has(x.schema_name+'.'+x.object_name)).column_count+=1;
 assert.throws(()=>compareFifty(changed,local()),/S06/);
});
test('offline CLI writes only fresh, distinct proof path',()=>{
 const dir=mkdtempSync(join(tmpdir(),'s06-fifty-'));
 try{
 const input=join(dir,'local.json'),output=join(dir,'proof.json');
 writeFileSync(input,JSON.stringify(local()));
 const text=execFileSync(process.execPath,['scripts/verify-v3-s06-fifty-relation-parity.mjs',path,input,output],{encoding:'utf8'});
 assert.match(text,/FIFTY_METADATA_PARITY_NOT_CERTIFIED/);
 assert.equal(JSON.parse(readFileSync(output,'utf8')).equal,true);
 assert.throws(()=>execFileSync(process.execPath,['scripts/verify-v3-s06-fifty-relation-parity.mjs',path,input,output],{stdio:'pipe'}));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('no hosted test traffic or production approval is represented in fixture source',()=>{
 const sql=readFileSync('docs/v3/recovery-candidates/evidence/s06-hosted-fifty-next-relations-local.sql','utf8');
 const tables=[...sql.matchAll(/CREATE TABLE "([a-z]+)"\."([a-z_0-9]+)"/g)].map(x=>x[1]+'.'+x[2]);
 assert.equal(tables.length,50);assert.equal(new Set(tables).size,50);
 assert.deepEqual(new Set(tables),names);
 assert.match(sql,/S06 catalog-only trigger placeholder/);
 assert.doesNotMatch(sql,/https:\/\/[^\s]+supabase\.co/);
});
