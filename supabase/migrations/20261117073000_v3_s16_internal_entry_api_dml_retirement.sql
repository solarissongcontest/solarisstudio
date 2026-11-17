-- S16 P14: this reviewable Confirmation-owned Entry record is mutated
-- through scoped owner-definer commands, not raw API-role table updates.
-- The separate public.entries sync remains an acknowledged independent
-- direct-writer dependency and is intentionally OUTSIDE this narrow cutover.
-- Forward-only source; NOT permission to execute on hosted Supabase.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $s16_internal_entry_preflight$
declare
  v_table oid := to_regclass('public.internal_entries');
  v_command oid := to_regprocedure(
    'public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)'
  );
begin
  if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
    or exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.internal-entry-api-dml-retirement')
  then raise exception 'S16 internal Entry ACL cutover needs PG17 postgres and new source contract'
    using errcode='55000';end if;

  if v_table is null
     or not exists(select 1 from pg_class c where c.oid=v_table
       and c.relkind='r' and c.relrowsecurity
       and pg_get_userbyid(c.relowner)='postgres')
  then raise exception 'S16 P14 internal Entry owner, relation type or RLS differs from source'
    using errcode='55000';end if;

  if exists(select 1 from pg_attribute a where a.attrelid=v_table
       and a.attnum>0 and not a.attisdropped and a.attacl is not null)
  then raise exception 'S16 P14 internal Entry has separately granted column ACLs; review before retiring'
    using errcode='55000';end if;

  if not has_table_privilege('service_role',v_table,'SELECT')
  then raise exception 'S16 P14 canonical Confirmation service reader is missing SELECT'
    using errcode='55000';end if;

  if not has_table_privilege('service_role',v_table,'INSERT')
     or not has_table_privilege('service_role',v_table,'UPDATE')
     or not has_table_privilege('service_role',v_table,'DELETE')
  then raise exception 'S16 P14 expected service-role direct writer privilege shape drift: INSERT %, UPDATE %, DELETE %',
    has_table_privilege('service_role',v_table,'INSERT'),
    has_table_privilege('service_role',v_table,'UPDATE'),
    has_table_privilege('service_role',v_table,'DELETE')
    using errcode='55000';end if;

  if v_command is null
    or not exists(select 1 from pg_proc p where p.oid=v_command
      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
      and p.proconfig = array['search_path=pg_catalog, public, private']::text[]
      and position('confirmation.manage' in p.prosrc)>0
      and position('p_expected_version' in p.prosrc)>0
      and position('p_expected_entry_version' in p.prosrc)>0
      and position('private.studio2_claim_operation(' in p.prosrc)>0)
    or has_function_privilege('anon',v_command,'EXECUTE')
    or not has_function_privilege('authenticated',v_command,'EXECUTE')
  then raise exception 'S16 P14 canonical owner-definer CAS/receipt Entry review RPC drift'
    using errcode='55000';end if;

  if not exists(select 1 from pg_trigger t
      where t.tgrelid=v_table
        and t.tgname='studio2_guard_internal_entry_review_transition'
        and t.tgfoid=to_regprocedure('private.studio2_guard_direct_confirmation_review_transition()')
        and t.tgenabled='O' and not t.tgisinternal)
  then raise exception 'S16 P14 internal Entry review guard trigger drift'
    using errcode='55000';end if;
  if not exists(select 1 from pg_trigger t
      where t.tgrelid=v_table
        and t.tgname='studio2_touch_internal_entry_review_version'
        and t.tgfoid=to_regprocedure('private.studio2_touch_confirmation_review_version()')
        and t.tgenabled='O' and not t.tgisinternal)
  then raise exception 'S16 P14 internal Entry version touch trigger drift'
    using errcode='55000';end if;
end $s16_internal_entry_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.internal-entry-api-dml-retirement',1,'forward_fix_only',false,null,
  'Retire all direct internal Entry API-role writes; preserve CAS review RPC, version trigger and read access'
);

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.internal_entries from public,anon,authenticated,service_role;

do $s16_internal_entry_postcheck$
declare v_role text; v_priv text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_priv in array array[
      'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      if has_table_privilege(v_role,'public.internal_entries',v_priv)
      then raise exception 'S16 internal Entry direct API privilege remains: % %',v_role,v_priv
        using errcode='42501';end if;
    end loop;
    if has_any_column_privilege(v_role,'public.internal_entries','INSERT,UPDATE')
    then raise exception 'S16 internal Entry column API privilege remains: %',v_role
      using errcode='42501';end if;
  end loop;
  if not has_table_privilege('service_role','public.internal_entries','SELECT')
    or not has_function_privilege('authenticated',
      'public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)','EXECUTE')
  then raise exception 'S16 internal Entry read or governed review RPC unavailable'
    using errcode='55000';end if;
end $s16_internal_entry_postcheck$;

notify pgrst,'reload schema';
commit;
