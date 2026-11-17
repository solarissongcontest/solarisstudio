-- S16 COUNTRY: retire real API-role direct mutations without changing signup,
-- country claiming, Organizer moderation or owned HoD preference commands.
-- Forward-only source migration. Never apply to hosted without owner approval.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

do $country_preflight$
declare
  v_table oid := to_regclass('public.country_accounts');
  v_guard oid := to_regprocedure('private.studio2_guard_direct_client_write()');
  v_command text;
  v_expected_path text;
  v_fn pg_proc%rowtype;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or v_table is null or v_guard is null
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
     or exists (select 1 from private.v3_migration_contracts
                where migration_key='v3.s16.country-account-api-dml-retirement')
  then raise exception 'S16 country account cutover missing owner, registry or uninstalled source contract'
    using errcode='55000'; end if;

  if not exists(select 1 from pg_class c
     where c.oid=v_table and c.relkind='r' and c.relrowsecurity
       and pg_get_userbyid(c.relowner)='postgres')
     or exists(select 1 from pg_attribute a
        where a.attrelid=v_table and a.attnum>0 and not a.attisdropped and a.attacl is not null)
     or not exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
        where t.tgrelid=v_table and t.tgname='studio2_platform_direct_write_guard'
          and t.tgfoid=v_guard and t.tgtype=30 and t.tgenabled='O'
          and not t.tgisinternal and p.prosecdef
          and pg_get_userbyid(p.proowner)='postgres'
          and p.proconfig=array['search_path=pg_catalog, public, private']::text[])
     or not exists(select 1 from pg_trigger t
        where t.tgrelid=v_table and t.tgname='touch_country_accounts_updated_at'
          and t.tgfoid=to_regprocedure('public.touch_country_content_updated_at()')
          and t.tgenabled='O' and not t.tgisinternal)
     or not exists(select 1 from pg_trigger t
        where t.tgrelid=v_table and t.tgname='ensure_country_account_hod_role'
          and t.tgfoid=to_regprocedure('private.ensure_country_account_hod_role()')
          and t.tgenabled='O' and not t.tgisinternal)
  then raise exception 'S16 country accounts table owner, guard, trigger, RLS or attribute-grant drift'
    using errcode='55000'; end if;

  -- These four distinct writer paths were observed in the exact-main S16
  -- catalog. All run as owner; none needs table DML from a direct API session.
  -- Do not silently replace their source-defined search paths in this cutover.
  for v_command,v_expected_path in
    select * from (values
      ('public.claim_country_account(uuid)', 'public, private'),
      ('public.admin_set_country_account_status(uuid,text,text)', 'public'),
      ('public.claim_country_from_signup()', 'public, auth'),
      ('public.set_owned_hod_auto_assign(boolean)', 'public, pg_temp')
    ) paths(identity,path)
  loop
    select * into v_fn from pg_proc where oid=to_regprocedure(v_command);
    if v_fn.oid is null or not v_fn.prosecdef
       or pg_get_userbyid(v_fn.proowner)<>'postgres'
       or v_fn.proconfig is distinct from array['search_path='||v_expected_path]::text[]
       or has_function_privilege('anon',v_fn.oid,'EXECUTE')
    then raise exception 'S16 country owner writer identity, privilege or path drift: %, exists %, owner %, definer %, path %, anon EXECUTE %',
      v_command, v_fn.oid is not null,
      case when v_fn.oid is null then null else pg_get_userbyid(v_fn.proowner) end,
      v_fn.prosecdef, v_fn.proconfig,
      case when v_fn.oid is null then null else has_function_privilege('anon',v_fn.oid,'EXECUTE') end
      using errcode='55000'; end if;
  end loop;

  if not has_function_privilege('authenticated','public.claim_country_account(uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.claim_country_account(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.admin_set_country_account_status(uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.admin_set_country_account_status(uuid,text,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.set_owned_hod_auto_assign(boolean)','EXECUTE')
     or has_function_privilege('service_role','public.claim_country_from_signup()','EXECUTE')
     or not exists(select 1 from pg_trigger t
       where t.tgrelid='auth.users'::regclass and t.tgname='on_solaris_country_signup'
         and t.tgfoid=to_regprocedure('public.claim_country_from_signup()')
         and t.tgenabled='O' and not t.tgisinternal)
     or not has_table_privilege('service_role',v_table,'SELECT')
     or not has_table_privilege('authenticated',v_table,'SELECT')
  then raise exception 'S16 signup/claim/moderation/HoD invocation authority or table read contract drift'
    using errcode='55000'; end if;
end $country_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.country-account-api-dml-retirement',1,'forward_fix_only',false,null,
  'Retire API-role direct writes to country_accounts, preserving four owner-defined commands and auth.users signup trigger'
);

revoke insert,update,delete,truncate,references,trigger,maintain on table
  public.country_accounts
from public,anon,authenticated,service_role;

do $country_postcheck$
declare v_role text; v_priv text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_priv in array array[
      'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      if has_table_privilege(v_role,'public.country_accounts',v_priv)
      then raise exception 'S16 country direct API privilege survived: % %',v_role,v_priv
        using errcode='42501'; end if;
    end loop;
    if has_any_column_privilege(v_role,'public.country_accounts','INSERT,UPDATE')
    then raise exception 'S16 country column-level API mutation privilege survived: %',v_role
      using errcode='42501'; end if;
  end loop;
  if not has_table_privilege('authenticated','public.country_accounts','SELECT')
     or not has_table_privilege('service_role','public.country_accounts','SELECT')
  then raise exception 'S16 country read contract regressed' using errcode='55000'; end if;
end $country_postcheck$;

notify pgrst,'reload schema';
commit;
