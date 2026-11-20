-- P07 S16: retire raw API DML on governed Confirmation rounds and edit tokens.
-- This SQL is source-only until separately approved for hosted migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  v_table text;
  v_oid oid;
  v_identity text;
  v_proc pg_proc%rowtype;
  v_trigger_name text;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
     or exists (select 1 from private.v3_migration_contracts
                where migration_key = 'v3.s16.confirmation-round-edit-token-dml-retirement')
  then
    raise exception 'S16 P07 round/token DML cutover requires fresh postgres-owned PostgreSQL 17 replay'
      using errcode = '55000';
  end if;

  foreach v_table in array array['public.submission_rounds','public.edit_tokens'] loop
    v_oid := to_regclass(v_table);
    if v_oid is null
       or not exists (select 1 from pg_class c
                      where c.oid = v_oid and c.relkind = 'r'
                        and c.relrowsecurity and pg_get_userbyid(c.relowner) = 'postgres')
       or exists (select 1 from pg_attribute a
                  where a.attrelid = v_oid and a.attnum > 0
                    and not a.attisdropped and a.attacl is not null)
       or not has_table_privilege('service_role',v_oid,'INSERT,UPDATE,DELETE,TRUNCATE')
    then
      raise exception 'S16 P07 expected table ownership/RLS/ACL drift for %', v_table
        using errcode = '55000';
    end if;
  end loop;

  foreach v_identity in array array[
    'public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)',
    'public.v3_submit_confirmation(jsonb,uuid,text,text)',
    'public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)'
  ] loop
    select * into v_proc from pg_proc where oid = to_regprocedure(v_identity);
    if v_proc.oid is null
       or not v_proc.prosecdef
       or pg_get_userbyid(v_proc.proowner) <> 'postgres'
       or not has_function_privilege('authenticated',v_proc.oid,'EXECUTE')
       or not exists (select 1 from unnest(v_proc.proconfig) cfg
                      where cfg like 'search_path=pg_catalog,%')
    then
      raise exception 'S16 P07 missing effective governed Confirmation command: %',v_identity
        using errcode = '55000';
    end if;
  end loop;

  foreach v_trigger_name in array array[
    'studio2_confirmation_round_touch_version',
    'studio2_guard_direct_confirmation_round_update',
    'studio2_guard_direct_confirmation_round_delete'
  ] loop
    if not exists (select 1 from pg_trigger t
                   where t.tgrelid = 'public.submission_rounds'::regclass
                     and t.tgname = v_trigger_name and t.tgenabled = 'O'
                     and not t.tgisinternal)
    then raise exception 'S16 P07 missing required round guard/version trigger: %',v_trigger_name
      using errcode = '55000';end if;
  end loop;

  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.edit_tokens'::regclass
                   and t.tgname = 'v3_touch_confirmation_edit_token_version'
                   and t.tgenabled = 'O' and not t.tgisinternal)
  then raise exception 'S16 P07 missing edit-token response-access version trigger'
    using errcode = '55000';end if;
end
$preflight$;

select public.v3_register_migration_contract(
  'v3.s16.confirmation-round-edit-token-dml-retirement',1,'forward_fix_only',false,null,
  'Retire raw anon/authenticated/service-role write privileges on Confirmation round and edit-token state while preserving R2/CAS/receipts and token lifecycle'
);

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.submission_rounds from public,anon,authenticated,service_role;
revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.edit_tokens from public,anon,authenticated,service_role;

do $postcheck$
declare
  v_table text;
  v_role text;
  v_priv text;
begin
  foreach v_table in array array['public.submission_rounds','public.edit_tokens'] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(v_role,v_table,v_priv) then
          raise exception 'S16 P07 raw Confirmation authority remained: % % %',
            v_table,v_role,v_priv using errcode = '42501';
        end if;
      end loop;
      if has_any_column_privilege(v_role,v_table,'INSERT,UPDATE') then
        raise exception 'S16 P07 column-level DML survived: % %',v_table,v_role
          using errcode = '42501';
      end if;
    end loop;
  end loop;
end
$postcheck$;

notify pgrst, 'reload schema';
commit;
