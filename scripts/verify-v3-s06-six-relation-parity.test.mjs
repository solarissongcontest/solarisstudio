import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SIX,compareSix} from './verify-v3-s06-six-relation-parity.mjs';
const hosted=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',import.meta.url),'utf8'));
const fixture=()=>({pg_version_num:170011,relations:SIX.map(k=>structuredClone(hosted.relations.find(r=>r.schema_name+'.'+r.object_name===k)))});
test('exact six hosted-observed relation schema metadata can pass without certification',()=>{
 const r=compareSix(hosted,fixture());
 assert.equal(r.equal,true);assert.equal(r.newLocalRelationIdentities,6);
 assert.equal(r.hostedRelations,215);assert.equal(r.hostedRoutineIdentities,727);
 assert.equal(r.fullHostedEquivalenceCertified,false);assert.equal(r.releaseAuthorized,false);
 assert.equal(r.reviewerAcceptanceOutstanding,true);
});
test('unexpected, duplicate, missing or differently versioned physical tables fail closed',()=>{
 const x=fixture();x.relations.pop();assert.throws(()=>compareSix(hosted,x),/exactly six/);
 const y=fixture();y.relations[0]=y.relations[1];assert.throws(()=>compareSix(hosted,y),/duplicate local/);
 const z=fixture();z.relations[1].object_name='alien';assert.throws(()=>compareSix(hosted,z),/unexpected/);
 const v=fixture();v.pg_version_num=160000;assert.throws(()=>compareSix(hosted,v),/PG17\.11/);
});
test('all catalog security/function-relevant table fields must match',()=>{
 for(const [f,v] of [
  ['columns_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],['constraints_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['indexes_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],['acl_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['policies_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],['triggers_md5','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ['owner_name','not_postgres'],['rls_enabled',true],['constraint_count',30],['index_count',12],['column_count',500]
 ]){const x=fixture();x.relations[0][f]=v;assert.equal(compareSix(hosted,x).equal,false,'reject '+f);}
});
test('invalid digest or changed frozen baseline fails closed',()=>{
 const x=fixture();x.relations[1].columns_md5='invalid';assert.throws(()=>compareSix(hosted,x),/invalid digest/);
 const y=structuredClone(hosted);y.relations.find(r=>r.schema_name==='private'&&r.object_name==='v3_televote_recovery_handles').constraint_count=7;
 assert.throws(()=>compareSix(y,fixture()),/hosted contract/);
 const z=structuredClone(hosted);z.routines=[];assert.throws(()=>compareSix(z,fixture()),/215\/727/);
});
test('parity proof always refuses production certification and writes',()=>{
 const r=compareSix(hosted,fixture());assert.equal(r.productionQueriesByVerifier,0);
 assert.equal(r.productionWritesByVerifier,0);
 assert.match(r.limitation,/Cannot establish 74-table full-field compatibility/);
});
