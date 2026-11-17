-- S16 P04: Integrity is mutated through existing postgres-owner SECURITY
-- DEFINER RPCs, not direct service_role/anonymous table writes. Preserve all
-- case/appeal/evidence validation and audit triggers; no broad allowlist.
-- FORWARD ONLY. Hosted Supabase changes require separate explicit approval.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $s16_integrity_preflight$
declare
  v_table text;
  v_oid oid;
  v_fn text;
  v_procedure pg_proc%rowtype;
begin
  if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
    or exists (select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.integrity-api-table-dml-retirement')
  then raise exception 'S16 Integrity DML cutover requires source postgres owner, PG17 and uninstalled contract'
    using errcode='55000'; end if;

  foreach v_table in array array[
    'public.integrity_cases',
    'public.integrity_case_events',
    'public.integrity_case_appeals',
    'public.integrity_case_evidence'
  ] loop
    v_oid := to_regclass(v_table);
    if v_oid is null
      or not exists (select 1 from pg_class c where c.oid=v_oid
        and c.relkind='r' and c.relrowsecurity
        and pg_get_userbyid(c.relowner)='postgres')
      or exists (select 1 from pg_attribute a where a.attrelid=v_oid
        and a.attnum>0 and not a.attisdropped and a.attacl is not null)
      or not has_table_privilege('service_role',v_oid,'INSERT,UPDATE,DELETE,TRUNCATE')
    then raise exception 'S16 Integrity table/owner/RLS/ACL drift: %',v_table
      using errcode='55000'; end if;
  end loop;

  -- These exact original RPCs cover case creation, finding/event logging,
  -- appeal submission, and evidence registration. Additional operations
  -- remain unmodified. SECURITY DEFINER guarantees command-owned writes
  -- after caller DML grants are retired.
  foreach v_fn in array array[
    'public.public_create_anonymous_integrity_case(text,text,text,text,text,text[],text,text)',
    'public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)',
    'public.reporter_submit_integrity_appeal(uuid,uuid,text)',
    'public.admin_register_integrity_evidence(uuid,text,text,text,text,boolean)'
  ] loop
    select * into v_procedure from pg_proc where oid=to_regprocedure(v_fn);
    if v_procedure.oid is null
       or not v_procedure.prosecdef
       or pg_get_userbyid(v_procedure.proowner)<>'postgres'
       or not has_function_privilege('authenticated',v_procedure.oid,'EXECUTE')
    then raise exception 'S16 Integrity owner RPC missing or not callable by authorized user: %',v_fn
      using errcode='55000'; end if;
  end loop;

  if not has_function_privilege('anon',to_regprocedure('public.public_create_anonymous_integrity_case(text,text,text,text,text,text[],text,text)'),'EXECUTE')
    or has_function_privilege('anon',to_regprocedure('public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)'),'EXECUTE')
    or has_function_privilege('anon',to_regprocedure('public.reporter_submit_integrity_appeal(uuid,uuid,text)'),'EXECUTE')
    or has_function_privilege('anon',to_regprocedure('public.admin_register_integrity_evidence(uuid,text,text,text,text,boolean)'),'EXECUTE')
  then raise exception 'S16 Integrity public report versus authorized write boundary drift'
    using errcode='55000'; end if;
end $s16_integrity_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.integrity-api-table-dml-retirement',1,'forward_fix_only',false,null,
  'Retire direct API DML on Integrity case/event/appeal/evidence while preserving case commands and their triggers'
);

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.integrity_cases from public,anon,authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.integrity_case_events from public,anon,authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.integrity_case_appeals from public,anon,authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.integrity_case_evidence from public,anon,authenticated,service_role;

do $s16_integrity_postcheck$
declare v_table text; v_role text; v_priv text;
begin
  foreach v_table in array array[
    'public.integrity_cases',
    'public.integrity_case_events',
    'public.integrity_case_appeals',
    'public.integrity_case_evidence'
  ] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_priv in array array[
        'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
      ] loop
        if has_table_privilege(v_role,v_table,v_priv)
        then raise exception 'S16 Integrity API DML retained: % % %',v_table,v_role,v_priv
          using errcode='42501';end if;
      end loop;
      if has_any_column_privilege(v_role,v_table,'INSERT,UPDATE')
      then raise exception 'S16 Integrity column DML retained: % %',v_table,v_role
        using errcode='42501';end if;
    end loop;
    -- Do not grant SELECT: Integrity confidentiality may deny even service_role
    -- direct reads. This cutover changes only write privileges.
  end loop;
  if not has_function_privilege('authenticated','public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)','EXECUTE')
     or not has_function_privilege('anon','public.public_create_anonymous_integrity_case(text,text,text,text,text,text[],text,text)','EXECUTE')
  then raise exception 'S16 Integrity RPC availability regressed' using errcode='55000';end if;
end $s16_integrity_postcheck$;

notify pgrst,'reload schema';
commit;
