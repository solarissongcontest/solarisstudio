#!/usr/bin/env node
// LOCAL-ONLY donor for the S02 hosted-observed-*scope* PostgreSQL fixture.
// The 56-table fixture omits the source-owned publication command RPCs.
// Recover only missing functions from the immutable historical source; do not
// replay the historical migration, overwrite present routines, or claim hosted
// function-body equivalence. Run ONLY in network-isolated PG17.11 rehearsal.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
if (process.env.SOLARIS_S02_TARGET !== "local")
  throw Error("S16 publication donor refuses non-local execution");
const path = resolve(process.cwd(),
 "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql");
const source = readFileSync(path,"utf8");
const blob = createHash("sha1")
 .update("blob "+Buffer.byteLength(source)+"\0").update(source).digest("hex");
if (blob !== "3f711b37c92c058990f5dc99a4ca55ff67e90b02")
  throw Error("S16 publication historical source changed; requalify before using donor");
// The S02 schema fixture also omits the *source-owned* operation receipt
// helpers. Use the latest platform-mode-governed claim, not its older
// pre-mode version; complete() retains the original operation-contract source.
function sourcePinned(path, expectedBlob) {
 const text=readFileSync(resolve(process.cwd(),path),"utf8");
 const actual=createHash("sha1").update("blob "+Buffer.byteLength(text)+"\0").update(text).digest("hex");
 if(actual!==expectedBlob)throw Error("S16 local operation-source drift: "+path);
 return text;
}
const modeSource=sourcePinned(
 "supabase/migrations/20261003174000_organisation_os_v5_platform_operational_modes.sql",
 "a4f8c7a35df2d2caea98b82a3a4552ffbdb0d9ec");
const operationSource=sourcePinned(
 "supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql",
 "48a02d067cb803683057d704d375b202cb6321f6");

// Dependencies are ordered as originally declared. The fixture MAY have
// source-newer helper implementations; preserve them rather than downgrading.
const targets = [
 // Source-exact, owner-only receipt helpers required by authenticated
 // publication. The claim includes operational mode enforcement.
 ["private.studio2_claim_operation","uuid,text,text,text,jsonb",[],modeSource],
 ["private.studio2_complete_operation","uuid,jsonb",[],operationSource],
 ["private.studio2_normalise_publication_config","jsonb",[]],
 ["private.studio2_publication_has_any","jsonb",[]],
 ["private.studio2_publication_has_outcomes","jsonb",[]],
 ["private.studio2_result_release_ready","uuid",[]],
 ["private.studio2_publication_integrity_clear","uuid",[]],
 ["private.studio2_show_publication_transition_allowed","text,text",[]],
 ["private.studio2_create_show_publication_control","",[]],
 ["private.studio2_ensure_show_publication_control","uuid",[]],
 ["private.studio2_guard_direct_show_publication_write","",[]],
 ["public.studio2_show_publication_snapshot","uuid",["authenticated","service_role"]],
 ["public.studio2_show_publication_change_preview","uuid,text,jsonb,timestamptz",["authenticated","service_role"]],
 ["public.studio2_apply_show_publication_change","uuid,text,jsonb,timestamptz,uuid,text,bigint",["authenticated","service_role"]],
 ["public.studio2_publish_due_show_publications","",["service_role"]],
];
const q = (s)=>"'"+s.replaceAll("'","''")+"'";
const chunks = [];
for (let i=0;i<targets.length;i++){
 const [name,args,roles,sourceOverride] = targets[i];
 const sourceText=sourceOverride??source;
 const token="create or replace function "+name+"(";
 const start=sourceText.indexOf(token);
 if(start<0 || sourceText.indexOf(token,start+token.length)!==-1)
   throw Error("S16 publication donor source absent or ambiguous: "+name);
 const tail=sourceText.slice(start);
 const tagMatch=/\bas\s+(\$[a-z0-9_]*\$)/i.exec(tail);
 if(!tagMatch)throw Error("No function delimiter: "+name);
 const end=tail.indexOf(tagMatch[1]+";",tagMatch.index+tagMatch[0].length);
 if(end<0)throw Error("Unclosed source function: "+name);
 const body=tail.slice(0,end+tagMatch[1].length+1);
 if(body.length<260 || body.length>15000 ||
    !body.includes("set search_path = pg_catalog") ||
    !/\breturns\s+/i.test(body))
   throw Error("Publication source definition drift: "+name);
 const identity=name+"("+args+")";
 const delim="$v3_s16_pub_source_"+i+"$";
 if(body.includes(delim))throw Error("Fixture source quote collision");
 chunks.push(`do $fixture_${i}$
begin
 if to_regprocedure(${q(identity)}) is null then
   execute ${delim}
${body}
${delim};
   execute 'revoke all on function ${identity} from public,anon,authenticated,service_role';
   ${roles.length ? `execute 'grant execute on function ${identity} to ${roles.join(",")}';` : ""}
 end if;
end $fixture_${i}$;`);
}
const applySig="public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)";
const dueSig="public.studio2_publish_due_show_publications()";
const previewSig="public.studio2_show_publication_change_preview(uuid,text,jsonb,timestamptz)";
process.stdout.write(`-- Fixture-only publication helper donor from pinned historical source.
-- NOT a hosted forward migration or a release-certification artifact.
begin;
do $fixture_gate$
begin
 if current_user<>'postgres' or current_setting('server_version_num')<>'170011'
    or (select rolsuper or not rolbypassrls from pg_roles where rolname=current_user)
    or to_regclass('public.studio2_show_publication_controls') is null
    or to_regclass('public.studio2_show_publication_executions') is null then
   raise exception 'S16 publication donor requires reviewed PG17 non-superuser local fixture' using errcode='55000';
 end if;
 -- The donor is not a migration. On this *scoped* fixture the two commands
 -- must BOTH be absent; a repeat or partial installation must not pass
 -- the recovery runner's interrupted/duplicate-release evidence.
 if to_regprocedure('${applySig}') is not null
    or to_regprocedure('${dueSig}') is not null then
   raise exception 'S16 publication donor already installed or partial; refuse repeat' using errcode='55000';
 end if;
end $fixture_gate$;
${chunks.join("\n")}
do $fixture_verify$
begin
 if not exists(select 1 from pg_proc
      where oid=to_regprocedure('${applySig}') and prosecdef
      and pg_get_userbyid(proowner)='postgres'
      and proconfig=array['search_path=pg_catalog, public, private']::text[])
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('${dueSig}') and prosecdef
      and pg_get_userbyid(proowner)='postgres'
      and proconfig=array['search_path=pg_catalog, public, private']::text[])
    or to_regprocedure('${previewSig}') is null
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('private.studio2_claim_operation(uuid,text,text,text,jsonb)')
      and prosecdef and pg_get_userbyid(proowner)='postgres')
    or not exists(select 1 from pg_proc
      where oid=to_regprocedure('private.studio2_complete_operation(uuid,jsonb)')
      and prosecdef and pg_get_userbyid(proowner)='postgres')
    or has_function_privilege('authenticated',
      'private.studio2_claim_operation(uuid,text,text,text,jsonb)','EXECUTE')
    or has_function_privilege('service_role',
      'private.studio2_claim_operation(uuid,text,text,text,jsonb)','EXECUTE')
    or has_function_privilege('anon','${applySig}','EXECUTE')
    or not has_function_privilege('authenticated','${applySig}','EXECUTE')
    or has_function_privilege('authenticated','${dueSig}','EXECUTE')
    or not has_function_privilege('service_role','${dueSig}','EXECUTE') then
   raise exception 'S16 publication donor did not reproduce reviewed command authority' using errcode='55000';
 end if;
end $fixture_verify$;
commit;
`);
