#!/usr/bin/env node
// S06 final 15 names, strict 17-field frozen hosted digest comparison.
// Checks independent LOCAL catalog output; no database or network access.
// This is NOT routine/role/data/security or hosted-migration certification.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const S06_FINAL_FIFTEEN=Object.freeze({
  "private.v3_entry_reviews": [
    6,
    3,
    2,
    0,
    1,
    "postgres",
    false,
    false
  ],
  "private.v3_entry_versions": [
    13,
    7,
    3,
    0,
    2,
    "postgres",
    false,
    false
  ],
  "public.country_profile_sections": [
    17,
    6,
    2,
    5,
    2,
    "postgres",
    true,
    false
  ],
  "public.country_themes": [
    24,
    19,
    1,
    5,
    2,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_appeals": [
    19,
    11,
    4,
    0,
    2,
    "postgres",
    true,
    false
  ],
  "public.prediction_entry_versions": [
    5,
    4,
    2,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.prediction_items": [
    7,
    6,
    2,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.public_ux_events": [
    8,
    16,
    6,
    2,
    1,
    "postgres",
    true,
    false
  ],
  "public.studio2_incidents": [
    21,
    12,
    5,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.studio2_jury_members": [
    11,
    9,
    7,
    1,
    3,
    "postgres",
    true,
    false
  ],
  "public.studio2_notice_receipts": [
    6,
    3,
    2,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "public.studio2_notice_versions": [
    18,
    5,
    2,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "public.studio2_official_notices": [
    27,
    18,
    7,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.studio2_show_publication_executions": [
    11,
    10,
    3,
    0,
    3,
    "postgres",
    true,
    false
  ],
  "public.submission_review_history": [
    11,
    5,
    1,
    1,
    5,
    "postgres",
    true,
    false
  ]
});
const FIELDS=Object.freeze(['schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5','column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5','policy_count','policies_md5','trigger_count','triggers_md5']);
const DIGESTS=new Set(['acl_md5','columns_md5','constraints_md5','indexes_md5','policies_md5','triggers_md5']);
const COUNTS=new Set(['column_count','constraint_count','index_count','policy_count','trigger_count']);
const ID=r=>r.schema_name+'.'+r.object_name;
export function compareFinalFifteen(frozen, local){
 if(!frozen||!local||frozen.pg_version_num!==170011||local.pg_version_num!==170011
  ||!Array.isArray(frozen.relations)||frozen.relations.length!==215
  ||!Array.isArray(frozen.routines)||frozen.routines.length!==727
  ||!Array.isArray(local.relations)||local.relations.length!==15)
  throw Error('S06 final fifteen: requires frozen 215/727 and exactly 15 local PG17.11 rows');
 const names=new Set(Object.keys(S06_FINAL_FIFTEEN));
 if(names.size!==15)throw Error('S06 final fifteen: identity contract drift');
 const expected=new Map();
 for(const item of frozen.relations){if(expected.has(ID(item)))throw Error('S06 duplicate frozen identity');expected.set(ID(item),item);}
 const observed=new Map();
 for(const item of local.relations){
  if(!item||typeof item!=='object'||Array.isArray(item)||!names.has(ID(item))||observed.has(ID(item)))
   throw Error('S06 final fifteen: unexpected/duplicate local identity');
  observed.set(ID(item),item);
 }
 const mismatches=[];
 for(const [name,[columns,constraints,indexes,policies,triggers,owner,rls,forced]] of Object.entries(S06_FINAL_FIFTEEN)){
  const x=expected.get(name),y=observed.get(name);
  if(!x||!y||x.object_kind!=='r'||x.column_count!==columns||x.constraint_count!==constraints
   ||x.index_count!==indexes||x.policy_count!==policies||x.trigger_count!==triggers
   ||x.owner_name!==owner||x.rls_enabled!==rls||x.rls_forced!==forced)
   throw Error('S06 final fifteen: frozen source contract altered '+name);
  if(Object.keys(y).length!==FIELDS.length||FIELDS.some(f=>!(f in y)))throw Error('S06 final fifteen: invalid local 17-field row '+name);
  for(const field of FIELDS){
   if(DIGESTS.has(field)&&(!/^[0-9a-f]{32}$/.test(x[field])||!/^[0-9a-f]{32}$/.test(y[field])))
    throw Error('S06 final fifteen: invalid hash '+name+'.'+field);
   if(COUNTS.has(field)&&(!Number.isInteger(y[field])||y[field]<0))
    throw Error('S06 final fifteen: invalid count '+name+'.'+field);
   if(x[field]!==y[field])mismatches.push(name+'.'+field);
  }
 }
 return {
  task:'S06',status:mismatches.length?'FINAL_FIFTEEN_METADATA_DRIFT_BLOCKED':'FINAL_FIFTEEN_METADATA_PARITY_NOT_CERTIFIED',
  equal:mismatches.length===0,addedTableIdentities:15,previousTableIdentities:200,
  combinedFixtureRelationNamesAfterIntegration:215,remainingUnmodeledTableNames:0,
  originalScopeLimitedTableFingerprints:56,fullFieldTableFingerprints:159,
  hostedRoutineIdentities:727,fullHostedEquivalenceCertified:false,
  securityRuntimeParityCertified:false,productionMigrationAuthorized:false,
  deploymentAuthorized:false,releaseAuthorized:false,
  mismatches,hostedQueriesByVerifier:0,hostedMutationsByVerifier:0,
  limitations:'215 table identities != 215-table complete equivalence: 56 original are scope-limited; 727 function bodies, role/extension security, application data, migration history, runtime behavior and rollout unproven.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {
  if(process.argv.length!==5)throw Error('Usage: node verify-v3-s06-final-fifteen-relation-parity.mjs <frozen.json> <local15.json> <new_report.json>');
  const [frozenPath,localPath,outputPath]=process.argv.slice(2).map(resolve);
  if(new Set([frozenPath,localPath,outputPath]).size!==3)throw Error('Refusing to overwrite evidence');
  const report=compareFinalFifteen(JSON.parse(readFileSync(frozenPath,'utf8')),JSON.parse(readFileSync(localPath,'utf8')));
  writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report));
  if(!report.equal)process.exitCode=1;
 }catch(error){console.error('S06 final fifteen BLOCKED: '+error.message);process.exitCode=2;}
}
