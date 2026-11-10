import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIVE,compareFive} from './verify-v3-s06-five-ledger-parity.mjs';
const frozen=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',import.meta.url),'utf8'));
const actual=()=>({pg_version_num:170011,relations:FIVE.map(k=>structuredClone(frozen.relations.find(x=>x.schema_name+'.'+x.object_name===k)))});
test('five exact hosted FK-ledger fingerprints remain NONCERTIFIED',()=>{
 const r=compareFive(frozen,actual());assert.equal(r.equal,true);
 assert.equal(r.fullHostedEquivalenceCertified,false);assert.equal(r.productionMigrationAuthorized,false);
 assert.equal(r.hostedRelations,215);assert.equal(r.hostedRoutineIdentities,727);
});
test('single missing, duplicate or extra table cannot pass',()=>{
 const m=actual();m.relations.pop();assert.throws(()=>compareFive(frozen,m),/exact five-table count/);
 const d=actual();d.relations[0]=d.relations[1];assert.throws(()=>compareFive(frozen,d),/duplicate local/);
 const e=actual();e.relations[0].object_name='not_hosted';assert.throws(()=>compareFive(frozen,e),/unexpected/);
});
test('each critical schema security digest and FK count mismatch fails',()=>{
 for(const [k,v] of Object.entries({columns_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',constraints_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   indexes_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',acl_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   policies_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',triggers_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   owner_name:'untrusted',rls_enabled:false,constraint_count:2,index_count:2,policy_count:1,trigger_count:1})){
   const m=actual();m.relations[0][k]=v;
   assert.equal(compareFive(frozen,m).equal,false,'must block drift '+k);
 }
});
test('bad digest/version and changed canonical host fingerprint fail closed',()=>{
 const a=actual();a.relations[1].columns_md5='not-md5';assert.throws(()=>compareFive(frozen,a),/invalid digest/);
 const b=actual();b.pg_version_num=160000;assert.throws(()=>compareFive(frozen,b),/PostgreSQL\/version/);
 const c=structuredClone(frozen);c.relations.find(x=>x.schema_name==='public'&&x.object_name==='studio2_jury_window_versions').constraint_count=2;
 assert.throws(()=>compareFive(c,actual()),/hosted FK-ledger baseline/);
});
test('verifier source is disconnected from production by construction',()=>{
 const r=compareFive(frozen,actual());
 assert.equal(r.productionReadsByVerifier,0);assert.equal(r.productionWritesByVerifier,0);
 assert.match(r.disclaimer,/no data or runtime\/role\/release certification/);
});