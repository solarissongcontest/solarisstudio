#!/usr/bin/env node
// S06: six FK-closed relations, read-only hosted pg_catalog metadata to LOCAL PG17.11.
// This compares strict 17-field fingerprints; never full-hosted or release certified.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SIX=Object.freeze([
 'private.v3_confirmation_account_drafts',
 'private.v3_televote_recovery_handles',
 'public.studio2_eligibility_override_versions',
 'public.studio2_next_in_line_submission_revisions',
 'public.studio2_platform_operational_state',
 'public.studio2_voting_declaration_policy'
]);
const EXPECTED_CONSTRAINTS=[4,4,4,6,5,4];
const EXPECTED_INDEXES=[1,2,1,3,1,1];
const FIELDS=Object.freeze(['schema_name','object_name','object_kind','owner_name',
 'rls_enabled','rls_forced','acl_md5','column_count','columns_md5','constraint_count',
 'constraints_md5','index_count','indexes_md5','policy_count','policies_md5',
 'trigger_count','triggers_md5']);
const DIGESTS=new Set(FIELDS.filter(k=>k.endsWith('_md5')));
const COUNTS=new Set(FIELDS.filter(k=>k.endsWith('_count')));
const HEX=/^[0-9a-f]{32}$/;
const id=x=>x.schema_name+'.'+x.object_name;
export function compareSix(hosted,local) {
 if(hosted?.pg_version_num!==170011||local?.pg_version_num!==170011||
    !Array.isArray(hosted.relations)||hosted.relations.length!==215||
    !Array.isArray(hosted.routines)||hosted.routines.length!==727||
    !Array.isArray(local.relations)||local.relations.length!==SIX.length)
   throw Error('S06 BLOCKED: expected PG17.11 frozen 215/727 metadata and exactly six local relations');
 const baseline=new Map();
 for(const r of hosted.relations){const k=id(r);
   if(baseline.has(k))throw Error('S06 BLOCKED: duplicate hosted object '+k);
   baseline.set(k,r);
 }
 const observed=new Map(),names=new Set(SIX);
 for(const r of local.relations){const k=id(r);
   if(!names.has(k)||observed.has(k))throw Error('S06 BLOCKED: unexpected or duplicate local relation '+k);
   observed.set(k,r);
 }
 const mismatches=[];
 for(let i=0;i<SIX.length;i++){
   const k=SIX[i],reference=baseline.get(k),actual=observed.get(k);
   if(!reference||!actual||reference.object_kind!=='r'||reference.owner_name!=='postgres'||
      reference.policy_count!==0||reference.trigger_count!==0||
      reference.constraint_count!==EXPECTED_CONSTRAINTS[i]||
      reference.index_count!==EXPECTED_INDEXES[i])
       throw Error('S06 BLOCKED: frozen six-relation hosted contract missing/changed '+k);
   for(const field of FIELDS){
     if(DIGESTS.has(field)&&(!HEX.test(reference[field])||!HEX.test(actual[field])))
       throw Error('S06 BLOCKED: invalid digest '+k+'.'+field);
     if(COUNTS.has(field)&&(!Number.isInteger(actual[field])||actual[field]<0))
       throw Error('S06 BLOCKED: invalid count '+k+'.'+field);
     if(reference[field]!==actual[field]) mismatches.push(k+'.'+field);
   }
 }
 return {task:'S06',status:mismatches.length?'SIX_RELATION_CATALOG_MISMATCH_BLOCKED':'SIX_RELATION_METADATA_PARITY_NOT_CERTIFIED',
   equal:mismatches.length===0,objects:SIX,hostedRelations:215,hostedRoutineIdentities:727,
   newLocalRelationIdentities:6,mismatches,productionQueriesByVerifier:0,productionWritesByVerifier:0,
   fullHostedEquivalenceCertified:false,releaseAuthorized:false,reviewerAcceptanceOutstanding:true,
   limitation:'Six new table catalog identities only. Cannot establish 74-table full-field compatibility, hosted role/function/extension behavior, migration closure, data semantics or production release.'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
   if(process.argv.length!==5)throw Error('S06 BLOCKED usage: node verifier <frozen215.json> <local6.json> <newReport.json>');
   const [frozen,local,out]=process.argv.slice(2).map(x=>resolve(x));
   if(new Set([frozen,local,out]).size!==3)throw Error('S06 BLOCKED: report cannot overwrite input evidence');
   const report=compareSix(JSON.parse(readFileSync(frozen,'utf8')),JSON.parse(readFileSync(local,'utf8')));
   writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify(report));
   if(!report.equal)process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=2;}
}
