-- S16 P09 follow-up: only the owner-executed session command may create
-- revocation tombstones. The Auth session ledger itself is unchanged.
-- Forward-only source migration. NEVER apply to hosted without owner approval.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

do $s16_session_preflight$
declare
  v_table oid := to_regclass('public.studio2_account_session_revocations');
  v_fn pg_proc%rowtype;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or v_table is null
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
     or exists (select 1 from private.v3_migration_contracts
       where migration_key='v3.s16.session-revocation-api-dml-retirement')
  then
    raise exception 'S16 session revocation cutover requires source owner, PG17 and uninstalled registry'
      using errcode='55000';
  end if;

  if not exists(select 1 from pg_class c where c.oid=v_table
       and c.relkind='r' and c.relrowsecurity
       and pg_get_userbyid(c.relowner)='postgres')
     or exists(select 1 from pg_attribute a where a.attrelid=v_table
       and a.attnum>0 and not a.attisdropped and a.attacl is not null)
     or exists(select 1 from pg_trigger t where t.tgrelid=v_table and not t.tgisinternal)
     or not has_table_privilege('service_role',v_table,'SELECT')
     or not has_table_privilege('service_role',v_table,'INSERT')
     or not has_table_privilege('service_role',v_table,'UPDATE')
     or not has_table_privilege('service_role',v_table,'DELETE')
     or not has_table_privilege('service_role',v_table,'TRUNCATE')
     or has_table_privilege('anon',v_table,'SELECT')
     or has_table_privilege('authenticated',v_table,'SELECT')
  then
    raise exception 'S16 session revocation table owner/RLS/ACL/trigger contract drift'
      using errcode='55000';
  end if;

  select * into v_fn from pg_proc
  where oid=to_regprocedure('public.v3_revoke_session(text,uuid,text)');
  if v_fn.oid is null or not v_fn.prosecdef
     or pg_get_userbyid(v_fn.proowner)<>'postgres'
     or v_fn.proconfig is distinct from
       array['search_path=pg_catalog, public, private, auth']::text[]
     or has_function_privilege('anon',v_fn.oid,'EXECUTE')
     or has_function_privilege('service_role',v_fn.oid,'EXECUTE')
     or not has_function_privilege('authenticated',v_fn.oid,'EXECUTE')
     or position('v_current_session := private.v3_require_active_auth_session()' in v_fn.prosrc)=0
     or position('private.studio2_claim_operation(' in v_fn.prosrc)=0
     or position('insert into public.studio2_account_session_revocations as existing_revocation' in v_fn.prosrc)=0
     or position('delete from auth.sessions session_row' in v_fn.prosrc)=0
     or position('session_row.user_id = v_actor' in v_fn.prosrc)=0
     or position('private.studio2_complete_operation(' in v_fn.prosrc)=0
  then
    raise exception 'S16 canonical revocation owner, caller grants or source-defined receipt contract drift'
      using errcode='55000';
  end if;
end $s16_session_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.session-revocation-api-dml-retirement',1,'forward_fix_only',false,null,
  'Retire raw API mutation of session revocation tombstones while keeping the canonical R3 owner command and SELECT intact'
);

-- The owner-executed SECURITY DEFINER function does not need caller table DML.
-- Keep SELECT for service recovery inspection, Auth session ownership and RLS.
revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.studio2_account_session_revocations
  from public,anon,authenticated,service_role;

do $s16_session_postcheck$
declare v_role text; v_priv text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_priv in array array[
      'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      if has_table_privilege(v_role,'public.studio2_account_session_revocations',v_priv)
      then raise exception 'S16 direct session tombstone mutation privilege survived: % %',
        v_role,v_priv using errcode='42501'; end if;
    end loop;
    if has_any_column_privilege(v_role,
         'public.studio2_account_session_revocations','INSERT,UPDATE')
    then raise exception 'S16 session tombstone column DML survived: %',v_role
      using errcode='42501'; end if;
  end loop;

  if not has_table_privilege('service_role','public.studio2_account_session_revocations','SELECT')
     or has_table_privilege('anon','public.studio2_account_session_revocations','SELECT')
     or has_table_privilege('authenticated','public.studio2_account_session_revocations','SELECT')
     or not has_function_privilege('authenticated','public.v3_revoke_session(text,uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.v3_revoke_session(text,uuid,text)','EXECUTE')
     or has_function_privilege('service_role','public.v3_revoke_session(text,uuid,text)','EXECUTE')
  then raise exception 'S16 session tombstone SELECT or canonical RPC caller contract drift'
    using errcode='55000'; end if;
end $s16_session_postcheck$;

notify pgrst,'reload schema';
commit;
