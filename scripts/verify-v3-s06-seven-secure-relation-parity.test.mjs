import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SEVEN_SECURE,compareSevenSecure} from './verify-v3-s06-seven-secure-relation-parity.mjs';
const hosted=JSON.parse(readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json',import.meta.url),'utf8'));
const fixture=()=>({pg_version_num:170011,relations:Object.keys(SEVEN_SECURE).map(k=>
 structuredClone(hosted.relations.find(x=>x.schema_name+'.'+x.object_name===k))
)});
test('seven observed Jury, Integrity and session identities never certify release',()=>{
 const r=compareSevenSecure(hosted,fixture());
 assert.equal(r.equal,true);
 assert.equal(r.status,'SEVEN_SECURE_METADATA_PARITY_NOT_CERTIFIED');
 assert.equal(r.additionalRelations,7);
 assert.equal(r.combinedFixtureRelationNamesAfterIntegration,83);
 assert.equal(r.remainingUnmodeledNamesOutsideIntegrated83,132);
 assert.equal(r.totalHostedRoutineIdentities,727);
 assert.equal(r.fullHostedEquivalenceCertified,false);
 assert.equal(r.productionDeploymentAuthorized,false);
 assert.equal(r.productionQueriesByVerifier,0);
});
test('missing, duplicate, unobserved or wrong Postgres version block',()=>{
 const x=fixture();x.relations.pop();assert.throws(()=>compareSevenSecure(hosted,x),/exactly seven/);
 const y=fixture();y.relations[0]=y.relations[1];assert.throws(()=>compareSevenSecure(hosted,y),/duplicate/);
 const z=fixture();z.relations[0].object_name='fabricated';assert.throws(()=>compareSevenSecure(hosted,z),/unobserved/);
 const p=fixture();p.pg_version_num=160000;assert.throws(()=>compareSevenSecure(hosted,p),/PG17.11/);
});
test('full 17-field drift, including privilege and integrity metadata, blocks',()=>{
 for(const [f,v] of Object.entries({
  columns_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  constraints_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  indexes_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  acl_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  policies_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  triggers_md5:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  owner_name:'rogue',rls_enabled:true,index_count:44,trigger_count:1,policy_count:1
 })){
  const x=fixture();x.relations[0][f]=v;
  assert.equal(compareSevenSecure(hosted,x).equal,false,'undetected drift: '+f);
 }
});
test('broken frozen baseline, invalid counts and digests refuse',()=>{
 const a=fixture();a.relations[1].indexes_md5='bad';assert.throws(()=>compareSevenSecure(hosted,a),/invalid digest/);
 const b=fixture();b.relations[1].constraint_count=-1;assert.throws(()=>compareSevenSecure(hosted,b),/invalid count/);
 const c=structuredClone(hosted);c.relations.find(x=>x.schema_name==='private'&&x.object_name==='v3_jury_drafts').policy_count=1;
 assert.throws(()=>compareSevenSecure(c,fixture()),/frozen hosted seven-table/);
 const d=structuredClone(hosted);d.relations=[];assert.throws(()=>compareSevenSecure(d,fixture()),/215\/727/);
});
test('strict source-only limitations and no production side effects',()=>{
 const r=compareSevenSecure(hosted,fixture());
 assert.equal(r.productionMutationsByVerifier,0);
 assert.equal(r.reviewerApprovalOutstanding,true);
 assert.match(r.limitations,/No complete 83-table digest parity/);
});

test('networkless SQL installs parent PKs before dependent audit FKs',()=>{
 const sql=readFileSync(new URL('../docs/v3/recovery-candidates/evidence/s06-hosted-seven-jury-integrity-account-local.sql',import.meta.url),'utf8');
 const decision=sql.indexOf('ALTER TABLE televoting.vote_integrity_decisions ADD CONSTRAINT "vote_integrity_decisions_pkey"');
 const sanction=sql.indexOf('ALTER TABLE televoting.voter_sanctions ADD CONSTRAINT "voter_sanctions_pkey"');
 const audit=sql.indexOf('ALTER TABLE televoting.integrity_action_audit ADD CONSTRAINT "integrity_action_audit_decision_id_fkey"');
 assert.ok(decision>0 && sanction>decision && audit>sanction,'FK parent uniqueness must be established before dependent audit constraints');
 assert.match(sql,/LOCAL FIXTURE ONLY/);
 assert.doesNotMatch(sql,/\\b(?:insert into|copy\\s+.+from|drop table)\\b/i);
});
