import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compareFinalFifteen,S06_FINAL_FIFTEEN} from './verify-v3-s06-final-fifteen-relation-parity.mjs';

const frozenPath='docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json';
const frozen=JSON.parse(readFileSync(frozenPath,'utf8'));
const names=new Set(Object.keys(S06_FINAL_FIFTEEN));
const local=()=>({pg_version_num:170011,relations:structuredClone(frozen.relations.filter(r=>names.has(r.schema_name+'.'+r.object_name)))});
test('exactly fifteen NEW hosted identities pass all 17 fields, never certify S06',()=>{
 assert.equal(names.size,15);
 const r=compareFinalFifteen(frozen,local());
 assert.equal(r.equal,true);
 assert.equal(r.combinedFixtureRelationNamesAfterIntegration,215);
 assert.equal(r.remainingUnmodeledTableNames,0);
 assert.equal(r.fullHostedEquivalenceCertified,false);
 assert.equal(r.productionMigrationAuthorized,false);
});
test('each meaningful catalog drift is rejected',()=>{
 const fields=['acl_md5','columns_md5','constraints_md5','indexes_md5','policies_md5','triggers_md5','column_count','constraint_count','index_count','policy_count','trigger_count','owner_name','rls_enabled','rls_forced','object_name'];
 for(const field of fields){
  const d=local();
  const x=d.relations[0];
  x[field]=typeof x[field]==='boolean'?!x[field]:typeof x[field]==='number'?x[field]+1:field.endsWith('_md5')?'0'.repeat(32):'wrong';
  if(field==='object_name')assert.throws(()=>compareFinalFifteen(frozen,d),/S06/);
  else {try{assert.equal(compareFinalFifteen(frozen,d).equal,false,field)}catch(e){assert.match(e.message,/S06/,field)}}
 }
});
test('incomplete, duplicate, stale, unobserved and corrupt catalogs fail closed',()=>{
 for(const mutate of [d=>d.relations.pop(),d=>d.relations.push(structuredClone(d.relations[0])),d=>d.relations[0].object_name='missing',
  d=>d.pg_version_num=170012,d=>d.relations[0].acl_md5='bad',d=>d.relations[0].unknown=true]){
  const d=local();mutate(d);assert.throws(()=>compareFinalFifteen(frozen,d),/S06/);
 }
 const wrong=structuredClone(frozen);wrong.routines.pop();assert.throws(()=>compareFinalFifteen(wrong,local()),/S06/);
 const shifted=structuredClone(frozen);shifted.relations.find(r=>names.has(r.schema_name+'.'+r.object_name)).index_count++;
 assert.throws(()=>compareFinalFifteen(shifted,local()),/S06/);
});
test('positive CLI cannot overwrite evidence, remains explicit noncertification',()=>{
 const dir=mkdtempSync(join(tmpdir(),'s06-last15-'));
 try{
  const input=join(dir,'actual.json'),output=join(dir,'proof.json');
  writeFileSync(input,JSON.stringify(local()));
  const result=execFileSync(process.execPath,['scripts/verify-v3-s06-final-fifteen-relation-parity.mjs',frozenPath,input,output],{encoding:'utf8'});
  assert.match(result,/FINAL_FIFTEEN_METADATA_PARITY_NOT_CERTIFIED/);
  assert.equal(JSON.parse(readFileSync(output,'utf8')).equal,true);
  assert.throws(()=>execFileSync(process.execPath,['scripts/verify-v3-s06-final-fifteen-relation-parity.mjs',frozenPath,input,output],{stdio:'pipe'}));
 } finally{rmSync(dir,{recursive:true,force:true})}
});
test('exactly fifteen distinct SQL names, no overlap with 200 prior identities, no hosted test traffic',()=>{
 const path='docs/v3/recovery-candidates/evidence/';
 const sql=readFileSync(path+'s06-hosted-final-fifteen-relations-local.sql','utf8');
 const actual=[...sql.matchAll(/CREATE TABLE "([a-z]+)"\."([a-z_0-9]+)"/g)].map(m=>m[1]+'.'+m[2]);
 assert.equal(actual.length,15);assert.deepEqual(new Set(actual),names);
 const previous=['s02-hosted-s14-archive-54-table-schema-fixture.sql','s02-hosted-s14-archive-extra-2-dependencies-local.sql','s06-hosted-seven-no-fk-relations-local.sql','s06-five-version-ledgers-local.sql','s06-hosted-eight-fk-closed-relations-local.sql','s06-hosted-seven-jury-integrity-account-local.sql','s06-hosted-seventeen-next-relations-local.sql','s06-hosted-fifty-next-relations-local.sql','s06-hosted-second-fifty-relations-local.sql'];
 const prior=new Set(previous.flatMap(p=>[...readFileSync(path+p,'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?\\?"?([a-z]+)\\?"?\.\\?"?([a-z_0-9]+)\\?"?/g)].map(m=>m[1]+'.'+m[2])));
 assert.equal(prior.size,200);
 for(const name of actual)assert.equal(prior.has(name),false,name);
 assert.match(sql,/catalog-only placeholder must never execute/);
 assert.doesNotMatch(sql,/https:\/\/[^\s]+supabase\.co/);
 assert.doesNotMatch(sql,/INSERT INTO|COPY .* FROM/i);
});
