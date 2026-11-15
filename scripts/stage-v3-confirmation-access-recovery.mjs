// Solaris Studio V3: System-owned, forward-only Confirmation recovery.
// Generates reviewed source SQL; never connects to a database or writes history.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVIDENCE = 'docs/v3/recovery-candidates/evidence/confirmation-access-prerequisites-observed-2026-11-15.json';
export const SOURCES = Object.freeze([
  ['20261114182000_v3_confirmation_exact_edition_reads.sql','2ceee2dbddd6104d96d5b22fafd67ad34d17d6b6','v3.confirmation.exact-edition-reads'],
  ['20261114183000_v3_confirmation_governed_response_access.sql','d97e9c7cc5b0fc3714631c867b1339f045d5c41c','v3.confirmation.response-access-commands'],
  ['20261114184000_v3_confirmation_legacy_access_grants_retirement.sql','e9771550ddda2617bd954d4f7df06cd5cdb30daa','v3.confirmation.retire-legacy-response-writes'],
  ['20261114185000_v3_confirmation_governed_maintenance_gate.sql','599f5a22d48006ea2f4dcac2cac8fd025106293e','v3.confirmation.governed-readonly-compat'],
  ['20261114191333_v3_confirmation_legacy_writers_owner_only.sql','43e5de9d383b462086b12a20cc98532f300d9da4','v3.confirmation.legacy-writers-owner-only'],
]);
const quote = v => "'"+JSON.stringify(v).replaceAll("'","''")+"'";
function frozenSource(root,[filename,expected,key]) {
  const sql=readFileSync(resolve(root,'supabase/migrations',filename),'utf8');
  const actual=createHash('sha1').update('blob '+Buffer.byteLength(sql)+'\0').update(sql).digest('hex');
  if(actual!==expected)throw Error('Unreviewed immutable Confirmation SQL: '+filename);
  if(!/^begin;\s/i.test(sql)||!/\ncommit;\s*$/i.test(sql))throw Error('Unexpected migration transaction: '+filename);
  const body=sql.replace(/^begin;\s*/i,'').replace(/\ncommit;\s*$/i,'');
  if(/(^|\n)\s*(begin|commit|rollback)\s*;/im.test(body) ||
     /supabase_migrations\.schema_migrations/i.test(body) ||
     !body.includes("'"+key+"'")) throw Error('Unreviewed nested transaction/history/key: '+filename);
  return '-- Source '+filename+' pinned blob='+expected+'\n'+body.trim()+'\n';
}
export function stageConfirmationRecovery(root=process.cwd()) {
  const e=JSON.parse(readFileSync(resolve(root,EVIDENCE),'utf8'));
  if(e.schemaVersion!==1 || e.projectRef!=='dkxmnvekiopyesuzggeu' ||
     e.serverVersionNum!=='170011' || e.migrationHead!=='20261101181812' ||
     e.readOnly!==true || e.applicationRowsRead!==false ||
     e.rawFunctionBodiesExported!==false || e.s13FoundationAbsent!==true ||
     e.governedAccessAbsent!==true || e.existingFunctions?.length!==10 ||
     e.existingTables?.length!==6 || e.absentFunctions?.length!==9 ||
     e.absentTriggers?.length!==2 || e.absentIndex!=='public.submissions_edition_submitted_idx')
    throw Error('Unqualified hosted Confirmation cutover evidence');
  if(new Set(e.existingFunctions.map(x=>x.identity)).size!==10 ||
     new Set(e.absentFunctions).size!==9 ||
     e.existingFunctions.some(x=>!x.identity||x.owner!=='postgres'||x.securityDefiner!==true||
       !/^[0-9a-f]{32}$/.test(x.definitionMd5)||!x.acl||!Array.isArray(x.config)||x.config.length!==1) ||
     e.existingTables.some(x=>!x.identity||x.owner!=='postgres'||x.rls!==true||!x.acl||
       !/^[0-9a-f]{32}$/.test(x.columnShapeMd5)||!Number.isSafeInteger(x.columns)||x.columns<1||
       !/^[0-9a-f]{32}$/.test(x.policyMd5)||!Number.isSafeInteger(x.policies)||x.policies<0))
    throw Error('Invalid Confirmation authority fingerprints');
  const source=SOURCES.map(s=>frozenSource(root,s)).join('\n');
  const sql=[
    '\\set ON_ERROR_STOP on',
    '-- LOCAL / REVIEW CANDIDATE ONLY. No hosted application, migration-history or release authorization.',
    '-- One outer transaction: interruption rolls back all five governed Confirmation source effects.',
    'begin;',
    "set local lock_timeout='5s';",
    "set local statement_timeout='120s';",
    'do $confirm_pre$',
    'declare item jsonb; actual jsonb; p pg_proc%rowtype; c pg_class%rowtype;',
    'begin',
    " if current_user<>'postgres' or current_setting('server_version_num')<>'170011'",
    "    or (select rolsuper or not rolbypassrls from pg_roles where rolname=current_user)",
    "    or to_regclass('private.v3_migration_contracts') is null",
    "    or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null then",
    "   raise exception 'Confirmation requires S13 and reviewed nonsuperuser owner' using errcode='55000';",
    ' end if;',
    ' for item in select value from jsonb_array_elements('+quote(e.existingFunctions)+'::jsonb) loop',
    "   select * into p from pg_proc where oid=to_regprocedure(item->>'identity');",
    "   if p.oid is null then raise exception 'Missing Confirmation prerequisite function: %',item->>'identity' using errcode='55000';end if;",
    "   actual:=jsonb_build_object('identity',item->>'identity','owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'definitionMd5',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'config',to_jsonb(p.proconfig));",
    "   if actual is distinct from item then raise exception 'Confirmation function definition/ACL drift: %',item->>'identity' using errcode='55000';end if;",
    ' end loop;',
    ' for item in select value from jsonb_array_elements('+quote(e.existingTables)+'::jsonb) loop',
    "   select * into c from pg_class where oid=to_regclass(item->>'identity');",
    "   if c.oid is null then raise exception 'Missing Confirmation prerequisite table: %',item->>'identity' using errcode='55000';end if;",
    "   actual:=jsonb_build_object('identity',item->>'identity','owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'acl',c.relacl::text,",
    "     'columnShapeMd5',(select md5(string_agg(a.attnum::text||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||a.attgenerated::text||':'||a.attidentity::text,'|' order by a.attnum)) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),",
    "     'columns',(select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),",
    "     'policyMd5',(select md5(coalesce(string_agg(policy_row.polname||':'||policy_row.polcmd::text||':'||policy_row.polpermissive::text||':'||coalesce(pg_get_expr(policy_row.polqual,policy_row.polrelid),'')||':'||coalesce(pg_get_expr(policy_row.polwithcheck,policy_row.polrelid),''),'|' order by policy_row.polname),'')) from pg_policy policy_row where policy_row.polrelid=c.oid),",
    "     'policies',(select count(*) from pg_policy p where p.polrelid=c.oid));",
    "   if actual is distinct from item then raise exception 'Confirmation table column/policy/owner/RLS/ACL drift: %',item->>'identity' using errcode='55000';end if;",
    ' end loop;',
    ' for item in select value from jsonb_array_elements('+quote(e.absentFunctions)+'::jsonb) loop',
    "   if to_regprocedure(item #>> '{}') is not null then raise exception 'Confirmation already/partially installed function: %',item #>> '{}' using errcode='55000';end if;",
    ' end loop;',
    " if to_regclass('public.submissions_edition_submitted_idx') is not null then raise exception 'Confirmation already/partially installed index' using errcode='55000';end if;",
    ' for item in select value from jsonb_array_elements('+quote(e.absentTriggers)+'::jsonb) loop',
    "   if exists(select 1 from pg_trigger where tgname=item #>> '{}' and not tgisinternal) then raise exception 'Confirmation already/partially installed trigger: %',item #>> '{}' using errcode='55000';end if;",
    ' end loop;',
    'end $confirm_pre$;',
    source,
    'do $confirm_post$',
    'declare identity text; actor_role text;',
    'begin',
    " if to_regprocedure('public.studio2_confirmation_response_access_preview(uuid,uuid)') is null",
    " or to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is null then",
    " raise exception 'Governed Confirmation commands absent after recovery' using errcode='55000';end if;",
    " foreach identity in array array['public.admin_confirmation_create_edit_token(uuid,text,integer)','public.admin_confirmation_revoke_edit_token(uuid)','public.admin_confirmation_delete_response(uuid)','public.admin_update_confirmation_controls(uuid,boolean,boolean,text)'] loop",
    " foreach actor_role in array array['anon','authenticated','service_role'] loop",
    " if has_function_privilege(actor_role,to_regprocedure(identity),'EXECUTE') then raise exception 'Legacy Confirmation writer still accessible: % %',identity,actor_role using errcode='42501';end if;",
    ' end loop;end loop;',
    " if (select count(*) from private.v3_migration_contracts where migration_key=any(array["+SOURCES.map(x=>"'"+x[2]+"'").join(',')+"]))<>5 then",
    " raise exception 'Incomplete Confirmation migration contract registration' using errcode='55000';end if;",
    'end $confirm_post$;',
    'commit;',
    ''
  ].join('\n');
  if(sql.includes('insert into supabase_migrations')||sql.includes('disable row level security'))
    throw Error('Forbidden migration-history/RLS mutation');
  return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.stdout.write(stageConfirmationRecovery());
