#!/usr/bin/env node
// S06 seven newly reconstructed tables, strictly compared to frozen hosted pg_catalog.
// Inputs MUST come from a networkless disposable PG17.11 fixture, never live SQL.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SEVEN_JURY=Object.freeze({
 'private.v3_jury_drafts':[10,9,3,false],
 'private.v3_jury_operations':[10,8,4,false],
 'public.studio2_account_session_revocations':[7,6,3,true],
 'televoting.historical_vote_observations':[12,4,5,true],
 'televoting.integrity_action_audit':[10,5,2,true],
 'televoting.vote_integrity_decisions':[10,5,3,true],
 'televoting.voter_sanctions':[16,7,5,true],
});
const FIELDS=Object.freeze([
 'schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5',
 'column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5',
 'policy_count','policies_md5','trigger_count','triggers_md5'
]);
const MD5=/^[0-9a-f]{32}$/;
const KEY=x=>x.schema_name+'.'+x.object_name;
export function compareSevenJury(frozen,local){
 if(!frozen||!local||frozen.pg_version_num!==170011||local.pg_version_num!==170011
   ||!Array.isArray(frozen.relations)||frozen.relations.length!==215
   ||!Array.isArray(frozen.routines)||frozen.routines.length!==727
   ||!Array.isArray(local.relations)||local.relations.length!==7)
   throw Error('S06 blocked: PG17.11 baseline/215/727 or exactly seven local relations required');
 const names=new Set(Object.keys(SEVEN_JURY));
 const hosted=new Map(),got=new Map();
 for(const r of frozen.relations){
   const key=KEY(r);
   if(hosted.has(key))throw Error('S06 blocked: duplicate hosted relation identity');
   hosted.set(key,r);
 }
 for(const r of local.relations){
   const key=KEY(r);
   if(!names.has(key)||got.has(key))throw Error('S06 blocked: duplicate or unobserved local table '+key);
   got.set(key,r);
 }
 const differences=[];
 for(const name of names){
   const expected=hosted.get(name),actual=got.get(name);
   const [columnCount,constraintCount,indexCount,rls]=SEVEN_JURY[name];
   if(!expected||!actual||expected.object_kind!=='r'||expected.owner_name!=='postgres'
      ||expected.column_count!==columnCount||expected.constraint_count!==constraintCount
      ||expected.index_count!==indexCount||expected.policy_count!==0||expected.trigger_count!==0
      ||expected.rls_enabled!==rls||expected.rls_forced!==false)
     throw Error('S06 blocked: frozen hosted seven-table schema contract invalid: '+name);
   for(const f of FIELDS){
     if(f.endsWith('_md5')&&(!MD5.test(expected[f])||!MD5.test(actual[f])))
       throw Error('S06 blocked: invalid digest '+name+'.'+f);
     if(f.endsWith('_count')&&(!Number.isInteger(actual[f])||actual[f]<0))
       throw Error('S06 blocked: invalid count '+name+'.'+f);
     if(expected[f]!==actual[f])differences.push(name+'.'+f);
   }
 }
 return {
   task:'S06',
   status:differences.length?'SEVEN_JURY_INTEGRITY_ACCOUNT_METADATA_MISMATCH_BLOCKED':'SEVEN_JURY_INTEGRITY_ACCOUNT_METADATA_PARITY_NOT_CERTIFIED',
   equal:differences.length===0,
   additionalRelations:7,
   expectedOriginalScopedFixture:76,
   combinedFixtureRelationNamesAfterIntegration:83,
   totalHostedRelations:215,
   remainingUnmodeledNamesOutsideIntegrated83:132,
   totalHostedRoutineIdentities:727,
   routinesRecreatedByThisBatch:0,
   mismatches:differences,
   productionQueriesByVerifier:0,
   productionMutationsByVerifier:0,
   fullHostedEquivalenceCertified:false,
   productionDeploymentAuthorized:false,
   reviewerApprovalOutstanding:true,
   limitations:'Seven new full-field hosted catalog fingerprints only. Original 56 have scoped checks, the preceding 20 have full-field comparators. No full 83-table parity, 727 function implementations, role memberships, extensions, actual rows, production migration history or release authorization.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5)throw Error('Usage: node verifier <frozen215.json> <local7.json> <new-report.json>');
  const paths=process.argv.slice(2).map(p=>resolve(p));
  if(new Set(paths).size!==3)throw Error('S06 blocked: output cannot overwrite evidence inputs');
  const report=compareSevenJury(JSON.parse(readFileSync(paths[0],'utf8')),JSON.parse(readFileSync(paths[1],'utf8')));
  writeFileSync(paths[2],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report));
  if(!report.equal)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=2}
}
