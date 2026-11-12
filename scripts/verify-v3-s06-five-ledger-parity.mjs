#!/usr/bin/env node
// Five PG17.11 FK-bound version ledgers, local-only metadata proof, never release certification.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const FIVE=Object.freeze([
 'public.studio2_confirmation_review_versions',
 'public.studio2_confirmation_round_versions',
 'public.studio2_jury_window_versions',
 'public.studio2_participation_status_versions',
 'public.studio2_permission_subject_versions'
]);
const FIELDS=['schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5',
 'column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5',
 'policy_count','policies_md5','trigger_count','triggers_md5'];
const DIGESTS=FIELDS.filter(f=>f.endsWith('_md5'));const COUNTS=FIELDS.filter(f=>f.endsWith('_count'));
const hex=/^[0-9a-f]{32}$/;
const id=x=>x.schema_name+'.'+x.object_name;
export function compareFive(frozen,actual){
 if(frozen?.pg_version_num!==170011||actual?.pg_version_num!==170011||
  frozen.relations?.length!==215||frozen.routines?.length!==727||
  actual.relations?.length!==5)throw Error('S06 blocked: PostgreSQL/version, 215/727 baseline or exact five-table count invalid');
 const names=new Set(FIVE),hosted=new Map();
 for(const x of frozen.relations){const k=id(x);if(hosted.has(k))throw Error('S06 blocked: duplicate frozen relation '+k);hosted.set(k,x)}
 const live=new Map();
 for(const x of actual.relations){const k=id(x);
  if(!names.has(k)||live.has(k))throw Error('S06 blocked: unexpected or duplicate local relation '+k);
  live.set(k,x);
 }
 const diffs=[];
 for(const k of FIVE){
  const a=hosted.get(k),b=live.get(k);
  if(!a||!b||a.object_kind!=='r'||a.constraint_count!==3||a.index_count!==1||
     a.policy_count!==0||a.trigger_count!==0||a.rls_enabled!==true)
    throw Error('S06 blocked: missing or changed hosted FK-ledger baseline '+k);
  for(const f of FIELDS){
   if(DIGESTS.includes(f)&&(!hex.test(a[f])||!hex.test(b[f])))throw Error('S06 blocked: invalid digest '+k+'.'+f);
   if(COUNTS.includes(f)&&(!Number.isInteger(b[f])||b[f]<0))throw Error('S06 blocked: invalid count '+k+'.'+f);
   if(a[f]!==b[f])diffs.push(k+'.'+f);
  }
 }
 return {task:'S06',status:diffs.length?'FIVE_VERSION_LEDGER_CATALOG_MISMATCH_BLOCKED':'FIVE_VERSION_LEDGER_METADATA_PARITY_NOT_CERTIFIED',
  equal:diffs.length===0,identities:FIVE,localFixtureRelations:5,hostedRelations:215,hostedRoutineIdentities:727,
  mismatches:diffs,productionReadsByVerifier:0,productionWritesByVerifier:0,
  fullHostedEquivalenceCertified:false,productionMigrationAuthorized:false,
  disclaimer:'Five FK-ledger catalog objects only; 56 S02 parents are scope-checked separately; no data or runtime/role/release certification'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==5)throw Error('Usage: node verifier <frozen215.json> <local5.json> <report-new.json>');
  const paths=process.argv.slice(2).map(p=>resolve(p));
  if(new Set(paths).size!==3)throw Error('S06 blocked: report must not overwrite inputs');
  const result=compareFive(JSON.parse(readFileSync(paths[0],'utf8')),JSON.parse(readFileSync(paths[1],'utf8')));
  writeFileSync(paths[2],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result));
  if(!result.equal)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=2}
}