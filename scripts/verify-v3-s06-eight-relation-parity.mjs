#!/usr/bin/env node
// S06: eight additional read-only-hosted-observed FK-closed table fingerprints.
// Input from a NETWORKLESS disposable local PG17.11 only. Never live SQL.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const EIGHT=Object.freeze({
 'private.v3_confirmation_account_drafts': [6,4,1,false],
 'private.v3_televote_recovery_handles': [4,4,2,false],
 'public.ssc_rulebook_events': [6,3,2,true],
 'public.ssc_rulebook_releases': [12,6,4,true],
 'public.studio2_eligibility_override_versions': [5,4,1,true],
 'public.studio2_next_in_line_submission_revisions': [6,6,3,true],
 'public.studio2_platform_operational_state': [9,5,1,true],
 'public.studio2_voting_declaration_policy': [4,4,1,true],
});
const FIELDS=Object.freeze([
 'schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5',
 'column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5',
 'policy_count','policies_md5','trigger_count','triggers_md5'
]);
const MD5=/^[0-9a-f]{32}$/;
const KEY=x=>x.schema_name+'.'+x.object_name;
export function compareEight(frozen,local){
 if(!frozen||!local||frozen.pg_version_num!==170011||local.pg_version_num!==170011
   ||!Array.isArray(frozen.relations)||frozen.relations.length!==215
   ||!Array.isArray(frozen.routines)||frozen.routines.length!==727
   ||!Array.isArray(local.relations)||local.relations.length!==8)
   throw Error('S06 blocked: PG17.11 baseline/215/727 or exactly eight local relations required');
 const names=new Set(Object.keys(EIGHT));
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
   const expected=hosted.get(name),actual=got.get(name),[columnCount,constraintCount,indexCount,rls]=EIGHT[name];
   if(!expected||!actual||expected.object_kind!=='r'||expected.owner_name!=='postgres'
      ||expected.column_count!==columnCount||expected.constraint_count!==constraintCount
      ||expected.index_count!==indexCount||expected.policy_count!==0||expected.trigger_count!==0
      ||expected.rls_enabled!==rls)
     throw Error('S06 blocked: frozen hosted eight-table schema contract invalid: '+name);
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
   status:differences.length?'EIGHT_TABLE_METADATA_MISMATCH_BLOCKED':'EIGHT_TABLE_METADATA_PARITY_NOT_CERTIFIED',
   equal:differences.length===0,
   additionalRelations:8,
   expectedOriginalScopedFixture:68,
   combinedFixtureRelationNamesAfterIntegration:76,
   totalHostedRelations:215,
   remainingUnmodeledNamesOutsideIntegrated76:139,
   totalHostedRoutineIdentities:727,
   routinesRecreatedByThisBatch:0,
   mismatches:differences,
   productionQueriesByVerifier:0,
   productionMutationsByVerifier:0,
   fullHostedEquivalenceCertified:false,
   productionDeploymentAuthorized:false,
   reviewerApprovalOutstanding:true,
   limitations:'Only eight full-field table catalog fingerprints against frozen evidence. Original 68 scoped checks remain separate. No full 76-table digest parity, 727 function definitions, roles/extension closure, production rows, hosted migration replay or release approval.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5)throw Error('Usage: node verifier <frozen215.json> <local8.json> <new-report.json>');
  const paths=process.argv.slice(2).map(p=>resolve(p));
  if(new Set(paths).size!==3)throw Error('S06 blocked: output cannot overwrite evidence inputs');
  const report=compareEight(JSON.parse(readFileSync(paths[0],'utf8')),JSON.parse(readFileSync(paths[1],'utf8')));
  writeFileSync(paths[2],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report));
  if(!report.equal)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=2}
}