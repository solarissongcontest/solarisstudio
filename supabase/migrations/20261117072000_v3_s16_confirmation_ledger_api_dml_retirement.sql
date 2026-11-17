-- S16 P07: Confirmation version and requirement ledgers are command-owned.
-- Preserve the existing participant submit, Organizer round change, version
-- restore, requirement reconcile, version-touch and Archive trigger contracts.
-- Forward-only source, never an authorization to run on hosted Supabase.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $s16_confirmation_preflight$
declare v_table text; v_oid oid; v_fn text; v_proc pg_proc%rowtype;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
     or exists(select 1 from private.v3_migration_contracts
       where migration_key='v3.s16.confirmation-ledger-api-dml-retirement')
  then raise exception 'S16 Confirmation ledger cutover requires postgres, PG17 and fresh source registry'
    using errcode='55000';end if;

  foreach v_table in array array[
    'public.submission_versions',
    'public.studio2_confirmation_requirements',
    'public.studio2_confirmation_round_versions'
  ] loop
    v_oid := to_regclass(v_table);
    if v_oid is null
      or not exists(select 1 from pg_class c where c.oid=v_oid
        and c.relkind='r' and c.relrowsecurity and pg_get_userbyid(c.relowner)='postgres')
      or exists(select 1 from pg_attribute a where a.attrelid=v_oid and a.attnum>0
        and not a.attisdropped and a.attacl is not null)
      or not has_table_privilege('service_role',v_oid,'INSERT,UPDATE,DELETE,TRUNCATE')
    then raise exception 'S16 Confirmation source table/owner/grants/RLS drift: %',v_table
      using errcode='55000';end if;
  end loop;

  -- The idempotency/receipt ledger lives outside the public API schema.
  -- Source deliberately does not enable RLS on this private internal table;
  -- its postgres-owned SECURITY DEFINER commands enforce session-scoped
  -- receipt retrieval. We tighten its DML without altering that read contract.
  v_oid := to_regclass('private.v3_confirmation_operations');
  if v_oid is null
    or not exists(select 1 from pg_class c where c.oid=v_oid
      and c.relkind='r' and pg_get_userbyid(c.relowner)='postgres'
      and not c.relrowsecurity)
    or exists(select 1 from pg_attribute a where a.attrelid=v_oid and a.attnum>0
      and not a.attisdropped and a.attacl is not null)
    or not has_table_privilege('service_role',v_oid,'INSERT,UPDATE,DELETE,TRUNCATE')
  then raise exception 'S16 private Confirmation receipt ledger owner/ACL/source drift'
    using errcode='55000';end if;

  foreach v_fn in array array[
    'public.v3_submit_confirmation(jsonb,uuid,text,text)',
    'public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)',
    'public.admin_restore_confirmation_version(uuid,uuid,text)'
  ] loop
    select * into v_proc from pg_proc where oid=to_regprocedure(v_fn);
    if v_proc.oid is null or not v_proc.prosecdef
      or pg_get_userbyid(v_proc.proowner)<>'postgres'
      or not has_function_privilege('authenticated',v_proc.oid,'EXECUTE')
    then raise exception 'S16 Confirmation governed submit/round/restore RPC drift: %',v_fn
      using errcode='55000';end if;
  end loop;

  -- Submission version + requirement triggers continue to fire from trusted
  -- definer commands. Never drop/recreate an existing trigger in an ACL cutover.
  if not exists(select 1 from pg_trigger t
     where t.tgrelid='public.submissions'::regclass
       and t.tgname='studio2_confirmation_requirement_reconcile'
       and t.tgfoid=to_regprocedure('private.studio2_confirmation_submission_requirement_trigger()')
       and t.tgenabled='O' and not t.tgisinternal)
    or not exists(select 1 from pg_trigger t
     where t.tgrelid='public.submission_rounds'::regclass
       and t.tgname='studio2_confirmation_round_touch_version'
       and t.tgfoid=to_regprocedure('private.studio2_touch_confirmation_round_version()')
       and t.tgenabled='O' and not t.tgisinternal)
  then raise exception 'S16 Confirmation canonical requirement/round-version trigger drift'
    using errcode='55000';end if;
end $s16_confirmation_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.confirmation-ledger-api-dml-retirement',1,'forward_fix_only',false,null,
  'Retire raw API DML on Confirmation version and requirement ledgers; preserve V3 submit, Organizer round and restore commands'
);

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.submission_versions from public,anon,authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.studio2_confirmation_requirements from public,anon,authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger,maintain
  on table public.studio2_confirmation_round_versions from public,anon,authenticated,service_role;

revoke insert,update,delete,truncate,references,trigger,maintain
  on table private.v3_confirmation_operations from public,anon,authenticated,service_role;

do $s16_confirmation_postcheck$
declare v_table text; v_role text; v_priv text;
begin
  foreach v_table in array array[
    'public.submission_versions',
    'public.studio2_confirmation_requirements',
    'public.studio2_confirmation_round_versions',
    'private.v3_confirmation_operations'
  ] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(v_role,v_table,v_priv)
        then raise exception 'S16 Confirmation direct DML remained: % % %',v_table,v_role,v_priv
          using errcode='42501';end if;
      end loop;
      if has_any_column_privilege(v_role,v_table,'INSERT,UPDATE')
      then raise exception 'S16 Confirmation column DML remained: % %',v_table,v_role
        using errcode='42501';end if;
    end loop;
    -- Read grants vary across historical ledgers. Preserve the existing ACL
    -- without broadening any direct SELECT authority.
  end loop;
end $s16_confirmation_postcheck$;

notify pgrst,'reload schema';
commit;
