import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SEVEN_JURY,compareSevenJury} from './verify-v3-s06-seven-jury-integrity-account-parity.mjs';
const hosted=JSON.parse(readFileSync(
 new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',import.meta.url),'utf8'
));
const fixture=()=>({pg_version_num:170011,relations:Object.keys(SEVEN_JURY).map(k=>
 structuredClone(hosted.relations.find(x=>x.schema_name+'.'+x.object_name===k))
)});
test('seven Jury/Integrity/Account fingerprints are non-certifying even on exact match',()=>{
 const r=compareSevenJury(hosted,fixture());
 assert.equal(r.equal,true);
 assert.equal(r.status,'SEVEN_JURY_INTEGRITY_ACCOUNT_METADATA_PARITY_NOT_CERTIFIED');
 assert.equal(r.additionalRelations,7);
 assert.equal(r.combinedFixtureRelationNamesAfterIntegration,83);
 assert.equal(r.remainingUnmodeledNamesOutsideIntegrated83,132);
 assert.equal(r.totalHostedRoutineIdentities,727);
 assert.equal(r.fullHostedEquivalenceCertified,false);
 assert.equal(r.productionDeploymentAuthorized,false);
 assert.equal(r.productionQueriesByVerifier,0);
});
test('missing, duplicate, unobserved table or incompatible PG version fail closed',()=>{
 const a=fixture();a.relations.pop();assert.throws(()=>compareSevenJury(hosted,a),/exactly seven/);
 const b=fixture();b.relations[0]=b.relations[1];assert.throws(()=>compareSevenJury(hosted,b),/duplicate/);
 const c=fixture();c.relations[0].object_name='not_hosted';assert.throws(()=>compareSevenJury(hosted,c),/unobserved/);
 const d=fixture();d.pg_version_num=160000;assert.throws(()=>compareSevenJury(hosted,d),/PG17\.11/);
});
test('all key catalog shape, ACL, RLS and security drifts reject',()=>{
 for(const [field,value] of Object.entries({
   columns_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   constraints_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   indexes_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   acl_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   policies_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   triggers_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   owner_name:'not-postgres',rls_enabled:true,rls_forced:true,
   index_count:999,trigger_count:1,policy_count:1
 })){
   const x=fixture();x.relations[0][field]=value;
   assert.equal(compareSevenJury(hosted,x).equal,false,field);
 }
});
test('invalid digests, counts and changed frozen source refuse',()=>{
 const a=fixture();a.relations[0].columns_md5='bad';assert.throws(()=>compareSevenJury(hosted,a),/invalid digest/);
 const b=fixture();b.relations[0].index_count=-1;assert.throws(()=>compareSevenJury(hosted,b),/invalid count/);
 const c=structuredClone(hosted);c.relations.find(x=>x.schema_name==='private'&&x.object_name==='v3_jury_drafts').column_count=999;
 assert.throws(()=>compareSevenJury(c,fixture()),/frozen hosted seven-table/);
 const d=structuredClone(hosted);d.routines=[];assert.throws(()=>compareSevenJury(d,fixture()),/215\/727/);
});
test('verifier never accesses production or grants release authority',()=>{
 const r=compareSevenJury(hosted,fixture());
 assert.equal(r.productionQueriesByVerifier,0);
 assert.equal(r.productionMutationsByVerifier,0);
 assert.equal(r.reviewerApprovalOutstanding,true);
 assert.match(r.limitations,/No full 83-table parity/);
});
