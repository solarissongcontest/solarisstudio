-- P04 forward-only: retire three stale-review/ambiguous-retry bypassing
-- adjudication RPCs, retaining governed R3 commands and owner-only primitives.
-- Source-only, NEVER applied to production without separate System approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $guard$
declare
 v_identity text; v_oid oid; v_p pg_proc%rowtype; v_name text;
 v_legacy_oids oid[]:=array[]::oid[];
begin
 if current_user<>'postgres'
   or current_setting('server_version_num')::integer/10000<>17
   or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
 then raise exception 'P04 requires locally rehearsed postgres-owned PG17 migration frontier' using errcode='55000';end if;
 foreach v_identity in array array[
  'public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)',
  'public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)',
  'public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])'
 ] loop
  v_oid:=to_regprocedure(v_identity);
  if v_oid is null then raise exception 'Legacy adjudication signature drift: %',v_identity using errcode='55000';end if;
  select * into v_p from pg_proc where oid=v_oid;
  if not v_p.prosecdef or pg_get_userbyid(v_p.proowner)<>'postgres'
    or has_function_privilege('anon',v_oid,'EXECUTE')
    or not has_function_privilege('authenticated',v_oid,'EXECUTE')
    or not has_function_privilege('service_role',v_oid,'EXECUTE')
    or position('gen_random_uuid' in v_p.prosrc)=0
    or position('select version' in lower(v_p.prosrc))=0
    or not exists(select 1 from unnest(v_p.proconfig) cfg where cfg like 'search_path=pg_catalog,%')
  then raise exception 'Legacy adjudication wrapper semantics/authority drifted: %',v_identity using errcode='55000';end if;
  v_legacy_oids:=array_append(v_legacy_oids,v_oid);
 end loop;
 foreach v_identity in array array[
  'public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)',
  'public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)',
  'public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)'
 ] loop
  v_oid:=to_regprocedure(v_identity);
  if v_oid is null or not exists(select 1 from pg_proc p where p.oid=v_oid
    and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
    and position('p_expected_version' in p.prosrc)>0
    and position('private.studio2_claim_operation' in p.prosrc)>0
    and position('private.studio2_complete_operation' in p.prosrc)>0
    and exists(select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=pg_catalog,%'))
    or not has_function_privilege('authenticated',v_oid,'EXECUTE')
    or has_function_privilege('anon',v_oid,'EXECUTE')
  then raise exception 'Canonical adjudication command not proven: %',v_identity using errcode='55000';end if;
 end loop;
 -- SQL PL/pgSQL calls may not be pg_depend-indexed. Abort on active callers.
 foreach v_name in array array[
  'admin_record_integrity_finding','admin_record_integrity_sanction','admin_decide_integrity_appeal'
 ] loop
  if exists(select 1 from pg_proc p where p.oid<>all(v_legacy_oids)
     and p.prosrc ~ ('(^|[^[:alnum:]_])'||v_name||'[[:space:]]*\('))
  then raise exception 'Installed SQL caller of retired Integrity RPC: %',v_name using errcode='55000';end if;
 end loop;
 foreach v_identity in array array[
  'public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean)',
  'public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)'
 ] loop
  v_oid:=to_regprocedure(v_identity);
  if v_oid is null or has_function_privilege('anon',v_oid,'EXECUTE')
     or has_function_privilege('authenticated',v_oid,'EXECUTE')
     or has_function_privilege('service_role',v_oid,'EXECUTE')
  then raise exception 'Owner-only implementation helper absent/exposed: %',v_identity using errcode='55000';end if;
 end loop;
end $guard$;
select public.v3_register_migration_contract(
 'v3.integrity.legacy-adjudication-rpc-retirement',1,'forward_fix_only',false,null,
 'Remove legacy finding/sanction/appeal decision entrypoints bypassing reviewed CAS and idempotent operation IDs'
);
drop function public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean) restrict;
drop function public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean) restrict;
drop function public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[]) restrict;
do $postflight$
declare v_identity text;
begin
 foreach v_identity in array array[
  'public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)',
  'public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)',
  'public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])'
 ] loop
  if to_regprocedure(v_identity) is not null
  then raise exception 'Legacy adjudication entrypoint survived: %',v_identity using errcode='55000';end if;
 end loop;
end $postflight$;
notify pgrst, 'reload schema';
commit;
