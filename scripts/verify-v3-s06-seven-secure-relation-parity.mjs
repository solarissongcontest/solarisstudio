#!/usr/bin/env node
// S06: compare seven hosted-catalog-observed Jury/Integrity/session table schemas.
// Only local JSON evidence is accepted; no network/SQL access.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const SEVEN_SECURE=Object.freeze({
 'private.v3_jury_drafts':[10,9,3,false],
 'private.v3_jury_operations':[10,8,4,false],
 'public.studio2_account_session_revocations':[7,6,3,true],
 'televoting.historical_vote_observations':[12,4,5,true],
 'televoting.integrity_action_audit':[10,5,2,true],
 'televoting.vote_integrity_decisions':[10,5,3,true],
 'televoting.voter_sanctions':[16,7,5,true]
});
const FIELDS=Object.freeze([
 'schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5',
 'column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5',
 'policy_count','policies_md5','trigger_count','triggers_md5'
]);
const MD5=/^[0-9a-f]{32}$/;
const KEY=x=>x.schema_name+'.'+x.object_name;
export function compareSevenSecure(frozen,local){
 if(!frozen||!local||frozen.pg_version_num!==170011||local.pg_version_num!==170011
   ||!Array.isArray(frozen.relations)||frozen.relations.length!==215
   ||!Array.isArray(frozen.routines)||frozen.routines.length!==727
   ||!Array.isArray(local.relations)||local.relations.length!==7)
   throw Error('S06 blocked: PG17.11 215/727 baseline and exactly seven local relations required');
 const names=new Set(Object.keys(SEVEN_SECURE)),hosted=new Map(),got=new Map();
 for(const r of frozen.relations){
   const key=KEY(r);
   if(hosted.has(key))throw Error('S06 blocked: duplicate hosted relation identity');
   hosted.set(key,r);
 }
 for(const r of local.relations){
   const key=KEY(r);
   if(!names.has(key)||got.has(key))throw Error('S06 blocked: duplicate or unobserved local relation '+key);
   got.set(key,r);
 }
 const differences=[];
 for(const name of names){
   const e=hosted.get(name),a=got.get(name),[columns,constraints,indexes,rls]=SEVEN_SECURE[name];
   if(!e||!a||e.object_kind!=='r'||e.owner_name!=='postgres'
    ||e.column_count!==columns||e.constraint_count!==constraints||e.index_count!==indexes
    ||e.policy_count!==0||e.trigger_count!==0||e.rls_enabled!==rls)
     throw Error('S06 blocked: frozen hosted seven-table contract invalid '+name);
   for(const f of FIELDS){
     if(f.endsWith('_md5')&&(!MD5.test(e[f])||!MD5.test(a[f])))
       throw Error('S06 blocked: invalid digest '+name+'.'+f);
     if(f.endsWith('_count')&&(!Number.isInteger(a[f])||a[f]<0))
       throw Error('S06 blocked: invalid count '+name+'.'+f);
     if(e[f]!==a[f])differences.push(name+'.'+f);
   }
 }
 return {
  task:'S06',status:differences.length?'SEVEN_SECURE_METADATA_MISMATCH_BLOCKED':'SEVEN_SECURE_METADATA_PARITY_NOT_CERTIFIED',
  equal:differences.length===0,additionalRelations:7,
  expectedOriginalScopedFixture:76,combinedFixtureRelationNamesAfterIntegration:83,
  totalHostedRelations:215,remainingUnmodeledNamesOutsideIntegrated83:132,
  totalHostedRoutineIdentities:727,routinesRecreatedByThisBatch:0,mismatches:differences,
  productionQueriesByVerifier:0,productionMutationsByVerifier:0,
  fullHostedEquivalenceCertified:false,productionDeploymentAuthorized:false,reviewerApprovalOutstanding:true,
  limitations:'Only seven added full-field catalog fingerprints. Prior 56 scoped and 20 full-field checks are separate. No complete 83-table digest parity, 727 routine implementations, roles, extensions, migration history, production row behavior or release approval.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5)throw Error('Usage: node verifier <frozen215.json> <local7.json> <new-report.json>');
  const paths=process.argv.slice(2).map(p=>resolve(p));
  if(new Set(paths).size!==3)throw Error('S06 blocked: output cannot overwrite evidence');
  const report=compareSevenSecure(JSON.parse(readFileSync(paths[0],'utf8')),JSON.parse(readFileSync(paths[1],'utf8')));
  writeFileSync(paths[2],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report));
  if(!report.equal)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=2}
}
