import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EIGHT,compareEight} from './verify-v3-s06-eight-relation-parity.mjs';
const hosted=JSON.parse(readFileSync(
 new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',import.meta.url),'utf8'
));
const fixture=()=>({pg_version_num:170011,relations:Object.keys(EIGHT).map(k=>
 structuredClone(hosted.relations.find(x=>x.schema_name+'.'+x.object_name===k))
)});
test('eight exact hosted catalog identities are always NOT release-certified',()=>{
 const r=compareEight(hosted,fixture());
 assert.equal(r.equal,true);
 assert.equal(r.status,'EIGHT_TABLE_METADATA_PARITY_NOT_CERTIFIED');
 assert.equal(r.additionalRelations,8);
 assert.equal(r.combinedFixtureRelationNamesAfterIntegration,76);
 assert.equal(r.remainingUnmodeledNamesOutsideIntegrated76,139);
 assert.equal(r.totalHostedRoutineIdentities,727);
 assert.equal(r.fullHostedEquivalenceCertified,false);
 assert.equal(r.productionDeploymentAuthorized,false);
 assert.equal(r.productionQueriesByVerifier,0);
});
test('unobserved, duplicate, missing, or wrong PG version fail closed',()=>{
 const one=fixture();one.relations.pop();
 assert.throws(()=>compareEight(hosted,one),/exactly eight/);
 const two=fixture();two.relations[0]=two.relations[1];
 assert.throws(()=>compareEight(hosted,two),/duplicate/);
 const three=fixture();three.relations[0].object_name='unobserved';
 assert.throws(()=>compareEight(hosted,three),/unobserved/);
 const four=fixture();four.pg_version_num=160000;
 assert.throws(()=>compareEight(hosted,four),/PG17\.11/);
});
test('columns, constraints, indexes, RLS, ACL, ownership, user triggers, policy digests all block drift',()=>{
 for(const [name,value] of Object.entries({
  columns_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  constraints_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  indexes_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  acl_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  policies_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  triggers_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  owner_name:'not-postgres',
  rls_enabled:true,
  index_count:99,trigger_count:1,policy_count:1
 })){
  const x=fixture();x.relations[0][name]=value;
  assert.equal(compareEight(hosted,x).equal,false,'must detect '+name);
 }
});
test('missing or invalid digests, counts, hosted baseline source refuse',()=>{
 const a=fixture();a.relations[1].columns_md5='wrong';assert.throws(()=>compareEight(hosted,a),/invalid digest/);
 const b=fixture();b.relations[1].constraint_count=-1;assert.throws(()=>compareEight(hosted,b),/invalid count/);
 const c=structuredClone(hosted);c.relations.find(x=>x.schema_name==='public'&&x.object_name==='ssc_rulebook_releases').policy_count=1;
 assert.throws(()=>compareEight(c,fixture()),/frozen hosted eight-table/);
 const d=structuredClone(hosted);d.relations=[];assert.throws(()=>compareEight(d,fixture()),/215\/727/);
});
test('no production data, migrations or privilege changes inside verifier',()=>{
 const r=compareEight(hosted,fixture());
 assert.equal(r.productionQueriesByVerifier,0);
 assert.equal(r.productionMutationsByVerifier,0);
 assert.equal(r.reviewerApprovalOutstanding,true);
 assert.match(r.limitations,/No full 76-table digest parity/);
});