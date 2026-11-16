// LOCAL ONLY. Source-derived Media helpers and SELECTED Storage metadata.
// This is not Storage-service, production-data or full hosted-equivalence proof.
import fs from 'node:fs';
import {createHash}from 'node:crypto';
import {extractDefinition}from './v3-s13-s14-authorization-dependencies.mjs';
if(process.env.SOLARIS_S02_TARGET!=='local')throw Error('Media fixture refuses non-local execution');
if(process.argv.includes('--owner-policy-fixture')){
 const policySource=fs.readFileSync('supabase/migrations/20261003210000_organisation_os_v5_read_only_enforcement.sql','utf8');
 const helperSource=fs.readFileSync('supabase/migrations/20260918192636_permission_engine_v2_storage_rls_cutover.sql','utf8');
 console.log(`begin;
 -- SOURCE-ONLY provider helper; no claim of full Storage service equivalence.
 create function storage.foldername(name text)returns text[]language plpgsql immutable as $folder$declare parts text[];begin parts:=string_to_array(name,'/');return parts[1:array_length(parts,1)-1];end $folder$;
 `);
 // Existing source body, used only to compile the exact observed policy shape.
 console.log(extractDefinition(helperSource,'private.studio2_storage_edition_access_allowed'));
 console.log('revoke all on function private.studio2_storage_edition_access_allowed(text,boolean) from public,anon,authenticated,service_role;');
 for(const name of ['country media bucket owner delete','country fonts owner delete','organizers delete edition artwork']){
  const token='create policy "'+name+'"';const start=policySource.indexOf(token);
  if(start<0||policySource.indexOf(token,start+1)>=0)throw Error('Ambiguous Storage policy source');
  console.log(policySource.slice(start,policySource.indexOf(';',start)+1));
 }
 console.log(`create policy "media_fixture_preserved_read" on storage.objects for select to authenticated using(bucket_id='unrelated-preserved');commit;`);
}else
if(process.argv.includes('--bootstrap')){
 console.log(`begin;
 do $local$ begin if current_user<>'solaris_recovery_bootstrap' or current_database() not in('recovery_operator_baseline','media_recovery_operator_probe') or current_setting('server_version_num')<>'170011' then raise exception 'Not isolated Media fixture';end if;end $local$;
 create role supabase_storage_admin login noinherit nosuperuser nocreatedb createrole nobypassrls;
 grant authenticator to supabase_storage_admin with inherit false,set true;
 create schema storage authorization supabase_storage_admin;
 -- Selected provider fields from disposable local Supabase Storage (PG17.6).
 -- Production owner/RLS/ACL envelope was independently observed on PG17.11.
 -- Provider triggers, complete object layout and real file bytes are NOT modeled.
 create table storage.buckets(id text primary key,name text not null,public boolean default false);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.buckets owner to supabase_storage_admin;
 alter table storage.objects owner to supabase_storage_admin;
 alter table storage.buckets enable row level security;
 alter table storage.objects enable row level security;
 grant usage on schema storage to postgres,supabase_storage_admin,anon,authenticated,service_role;
 grant all on storage.buckets,storage.objects to postgres,supabase_storage_admin with grant option;
 grant all on storage.buckets,storage.objects to service_role;
 grant select,insert,update,delete on storage.buckets,storage.objects to anon,authenticated;
 commit;`);
}else{
 const definitions=[
 ['private.studio2_can_upload_country_media','(uuid,uuid)','20261003170000_organisation_os_v5_country_media_upload_safety.sql','7aed067b40f793dbe7b9cf6cc5f6b1f2bfc7c3af',[]],
 ['private.studio2_upload_extension','(text,text,text)','20261003211000_organisation_os_v5_unified_upload_quarantine.sql','9f4391260a812d5d9e712836c0dca612de3cf251',[]],
 ['private.studio2_upload_platform_allows_prepare','()','20261003212000_organisation_os_v5_platform_permission_enforcement.sql','5647d416e02e2274724bc39c227a9c72b7b48706',[]],
 ['public.studio2_prepare_upload','(text,uuid,text,text,text,bigint,jsonb)','20261005043000_pr450_review_blocker_repairs.sql','2a08b84ba01e35acaa57f4e2b102ecfc2493860a',['anon','authenticated','service_role']],
 ['private.studio2_create_evidence_upload_authorization','(uuid,uuid,uuid,text,text,text,bigint,text,jsonb)','20261003214000_organisation_os_v5_integrity_upload_quarantine.sql','460a138f71dab5df765201da95a370e32f0cb588',[]],
 ];
 const frozen=JSON.parse(fs.readFileSync('docs/v3/recovery-candidates/evidence/s02-hosted-727-routine-fingerprints-2026-11-09.json','utf8'));
 console.log("begin;do $local$ begin if current_database() not in('recovery_operator_baseline','media_recovery_operator_probe') or current_user<>'postgres' then raise exception 'Not isolated Media fixture';end if;end $local$;");
 for(const[n,args,file,blob,roles]of definitions){
  const s=fs.readFileSync('supabase/migrations/'+file,'utf8');if(createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex')!==blob)throw Error('Media source drift: '+file);
  const row=frozen.functions.filter(x=>x.id.startsWith(n+'('));if(row.length!==1)throw Error('Ambiguous observed Media helper: '+n);
  const definition=extractDefinition(s.replace(/\bas (\$[a-z0-9_]*\$)/ig,'\nas $1'),n);
  console.log(`do $pre$ begin if to_regprocedure('${n}${args}') is not null and encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('${n}${args}')),'UTF8')),'hex')<>'${row[0].sha256}'then raise exception 'Unknown existing Media helper: ${n}';end if;end $pre$;`);
  console.log(definition,`revoke all on function ${n}${args} from public,anon,authenticated,service_role;`);
  if(roles.length)console.log(`grant execute on function ${n}${args} to ${roles.join(',')};`);
  console.log(`do $verify$ begin if encode(sha256(convert_to(pg_get_functiondef('${n}${args}'::regprocedure),'UTF8')),'hex')<>'${row[0].sha256}'then raise exception 'Source/observed Media helper definition mismatch: ${n}';end if;end $verify$;`);
 }
 console.log('commit;');
}
