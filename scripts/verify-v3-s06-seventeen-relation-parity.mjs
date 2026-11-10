#!/usr/bin/env node
// S06 17-table metadata parity. Offline JSON-only, never connects to Supabase.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const S06_SEVENTEEN=Object.freeze({
  "auth.audit_log_entries": [
    5,
    1,
    2,
    true,
    "supabase_auth_admin"
  ],
  "auth.instances": [
    5,
    1,
    1,
    true,
    "supabase_auth_admin"
  ],
  "auth.oauth_client_states": [
    4,
    1,
    2,
    false,
    "supabase_auth_admin"
  ],
  "auth.schema_migrations": [
    1,
    1,
    1,
    true,
    "supabase_auth_admin"
  ],
  "public.ssc_rule_interpretations": [
    15,
    9,
    4,
    true,
    "postgres"
  ],
  "public.ssc_rulebook_change_items": [
    10,
    8,
    3,
    true,
    "postgres"
  ],
  "public.studio2_country_media_upload_tokens": [
    11,
    8,
    3,
    true,
    "postgres"
  ],
  "public.studio2_host_bids": [
    26,
    14,
    6,
    true,
    "postgres"
  ],
  "public.studio2_host_bid_evaluations": [
    8,
    7,
    5,
    true,
    "postgres"
  ],
  "public.studio2_host_operations": [
    18,
    6,
    3,
    true,
    "postgres"
  ],
  "public.studio2_host_operation_executions": [
    9,
    8,
    5,
    true,
    "postgres"
  ],
  "public.studio2_platform_exit_preflights": [
    11,
    7,
    2,
    true,
    "postgres"
  ],
  "public.studio2_storylines": [
    15,
    11,
    6,
    true,
    "postgres"
  ],
  "public.studio2_storyline_items": [
    16,
    9,
    6,
    true,
    "postgres"
  ],
  "public.studio2_story_operation_executions": [
    10,
    9,
    6,
    true,
    "postgres"
  ],
  "public.studio2_upload_authorizations": [
    20,
    9,
    4,
    true,
    "postgres"
  ],
  "televoting.round_influence_results": [
    13,
    4,
    3,
    true,
    "postgres"
  ]
});
const FIELDS=Object.freeze(['schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5','column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5','policy_count','policies_md5','trigger_count','triggers_md5']);
const DIGESTS=new Set(['acl_md5','columns_md5','constraints_md5','indexes_md5','policies_md5','triggers_md5']);
const COUNTS=new Set(['column_count','constraint_count','index_count','policy_count','trigger_count']);
const MD5=/^[0-9a-f]{32}$/;
const key=x=>x.schema_name+'.'+x.object_name;
export function compareSeventeen(frozen,local) {
 if(!frozen||!local||frozen.pg_version_num!==170011||local.pg_version_num!==170011
   ||!Array.isArray(frozen.relations)||frozen.relations.length!==215
   ||!Array.isArray(frozen.routines)||frozen.routines.length!==727
   ||!Array.isArray(local.relations)||local.relations.length!==17)
   throw Error('S06 fail closed: exact PG17.11 215/727 baseline and 17 local tables required');
 const lookup=new Map();
 for(const r of frozen.relations){if(lookup.has(key(r)))throw Error('S06 duplicate hosted relation');lookup.set(key(r),r);}
 const actual=new Map(), expected=new Set(Object.keys(S06_SEVENTEEN));
 for(const r of local.relations) {
   const k=key(r);
   if(!expected.has(k)||actual.has(k))throw Error('S06 unobserved/duplicate local identity: '+k);
   actual.set(k,r);
 }
 const mismatches=[];
 for(const name of expected) {
   const e=lookup.get(name),a=actual.get(name),[c,k,i,rls,owner]=S06_SEVENTEEN[name];
   if(!e||!a||e.object_kind!=='r'||e.owner_name!==owner||e.column_count!==c
     ||e.constraint_count!==k||e.index_count!==i||e.rls_enabled!==rls||e.rls_forced
     ||e.policy_count!==0||e.trigger_count!==0)
     throw Error('S06 frozen 17-table contract invalid: '+name);
   if(Object.keys(a).length!==FIELDS.length||FIELDS.some(f=>!(f in a)))
     throw Error('S06 malformed 17-field local relation: '+name);
   for(const f of FIELDS){
     if(DIGESTS.has(f)&&(!MD5.test(e[f])||!MD5.test(a[f])))throw Error('S06 corrupt catalog digest: '+name+'.'+f);
     if(COUNTS.has(f)&&(!Number.isInteger(a[f])||a[f]<0))throw Error('S06 invalid local count: '+name+'.'+f);
     if(a[f]!==e[f])mismatches.push(name+'.'+f);
   }
 }
 return {
   task:'S06', status:mismatches.length?'SEVENTEEN_METADATA_DRIFT_BLOCKED':'SEVENTEEN_METADATA_PARITY_NOT_CERTIFIED',
   equal:mismatches.length===0, newTableIdentities:17, existingIntegratedNames:83,
   combinedFixtureRelationNamesAfterIntegration:100, hostedPhysicalRelations:215,
   remainingUnmodeledNamesOutside100:115, hostedRoutineIdentities:727,
   newRoutinesReproduced:0,mismatches,
   hostedQueriesByVerifier:0,hostedMutationsByVerifier:0,
   fullHostedEquivalenceCertified:false,productionMigrationAuthorized:false,releaseAuthorized:false,
   limitations:'Only 17 added full-field table fingerprints. Existing 56 S02 checks are scope-limited and 27 other full-field matches are separate; no global 215/727 parity, live rows, full routines, role memberships, extensions, migration history or release approval.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {
   if(process.argv.length!==5)throw Error('Usage: node verifier <frozen215.json> <local17.json> <new-report.json>');
   const paths=process.argv.slice(2).map(resolve);
   if(new Set(paths).size!==3)throw Error('S06 output must not overwrite evidence');
   const report=compareSeventeen(JSON.parse(readFileSync(paths[0],'utf8')),JSON.parse(readFileSync(paths[1],'utf8')));
   writeFileSync(paths[2],JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify(report));
   if(!report.equal)process.exitCode=1;
 } catch(err) {console.error(err.message);process.exitCode=2;}
}
