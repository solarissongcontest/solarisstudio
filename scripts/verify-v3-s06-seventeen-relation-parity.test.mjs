import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareSeventeen,S06_SEVENTEEN} from './verify-v3-s06-seventeen-relation-parity.mjs';
const frozen=JSON.parse(readFileSync('docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json','utf8'));
const names=new Set(Object.keys(S06_SEVENTEEN));
const local=()=>({pg_version_num:170011,relations:structuredClone(frozen.relations.filter(x=>names.has(x.schema_name+'.'+x.object_name)))});
test('17 observed identities compare with the immutable complete hosted catalog, but are not certified',()=>{
 const r=compareSeventeen(frozen,local());
 assert.equal(r.equal,true);assert.equal(r.combinedFixtureRelationNamesAfterIntegration,100);
 assert.equal(r.remainingUnmodeledNamesOutside100,115);
 assert.equal(r.fullHostedEquivalenceCertified,false);
 assert.equal(r.productionMigrationAuthorized,false);
});
test('catalog corruption, drift, missing/extra/duplicate identities fail closed',()=>{
 for(const mutation of [
   d=>d.relations[0].columns_md5='00000000000000000000000000000000',
   d=>d.relations[0].acl_md5='bad',
   d=>d.relations[0].index_count+=1,
   d=>d.relations[0].rls_enabled=!d.relations[0].rls_enabled,
   d=>d.relations[0].owner_name='postgres_fake',
   d=>d.relations[0].trigger_count=1
 ]) {const d=local();mutation(d);const result=()=>compareSeventeen(frozen,d);try{const r=result();assert.equal(r.equal,false);assert.ok(r.mismatches.length);}catch(err){assert.match(err.message,/S06/);}}
 for(const mutation of [
   d=>d.relations.pop(),
   d=>d.relations.push(structuredClone(d.relations[0])),
   d=>d.relations[0].object_name='unobserved_table',
   d=>{d.relations[0].surprise=true},
   d=>{d.pg_version_num=170012}
 ]) {const d=local();mutation(d);assert.throws(()=>compareSeventeen(frozen,d),/S06/);}
});
test('missing or stale full-hosted baseline and host field manipulation are never accepted',()=>{
 const gone=structuredClone(frozen);gone.relations.pop();
 assert.throws(()=>compareSeventeen(gone,local()),/S06/);
 const changed=structuredClone(frozen);changed.routines.pop();
 assert.throws(()=>compareSeventeen(changed,local()),/S06/);
 const broken=structuredClone(frozen);const i=broken.relations.findIndex(x=>names.has(x.schema_name+'.'+x.object_name));broken.relations[i].constraint_count+=1;
 assert.throws(()=>compareSeventeen(broken,local()),/S06/);
});

test('offline CLI resolves three distinct paths without treating map callback arguments as paths',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {execFileSync}=await import('node:child_process');
 const dir=mkdtempSync(join(tmpdir(),'s06-17-'));
 try{
   const input=join(dir,'local.json'),output=join(dir,'proof.json');
   writeFileSync(input,JSON.stringify(local()));
   const stdout=execFileSync(process.execPath,[
     'scripts/verify-v3-s06-seventeen-relation-parity.mjs',
     'docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',
     input,output],{encoding:'utf8'});
   assert.match(stdout,/SEVENTEEN_METADATA_PARITY_NOT_CERTIFIED/);
   assert.equal(JSON.parse(readFileSync(output,'utf8')).equal,true);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
