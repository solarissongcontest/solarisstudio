-- Preconditions for ONLY the dark S13 foundation batch; no shared objects altered.
do $s13_first_batch_preconditions$
declare r record; v_name text;
begin
  if current_setting('server_version_num') <> '170011'
     or session_user <> 'postgres' or current_user <> 'postgres'
     or current_setting('session_replication_role') <> 'origin' then
    raise exception 'S13 batch requires PG17.11, postgres owner session and origin triggers' using errcode='55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='postgres' and not rolsuper and rolbypassrls)
     or not exists(select 1 from pg_database where datname=current_database() and pg_get_userbyid(datdba)='postgres') then
    raise exception 'S13 batch requires observed non-superuser postgres owner' using errcode='55000';
  end if;
  if not exists(select 1 from pg_namespace where nspname='private' and pg_get_userbyid(nspowner)='postgres')
     or not exists(select 1 from pg_namespace where nspname='public' and pg_get_userbyid(nspowner)='pg_database_owner')
     or not has_schema_privilege(current_user,'private','USAGE,CREATE')
     or not has_schema_privilege(current_user,'public','USAGE,CREATE') then
    raise exception 'S13 batch schema owner/CREATE prerequisites differ' using errcode='55000';
  end if;
  if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')) <> 3 then
    raise exception 'S13 batch API role identities absent' using errcode='55000';
  end if;
  for r in select * from pg_roles where rolname in ('anon','authenticated','service_role') loop
    if r.rolsuper or r.rolcanlogin or r.rolcreaterole or r.rolcreatedb or r.rolreplication
       or not r.rolinherit or r.rolbypassrls <> (r.rolname='service_role')
       or exists(select 1 from pg_auth_members where member=r.oid) then
      raise exception 'S13 batch unreviewed API role attributes/membership: %',r.rolname using errcode='55000';
    end if;
  end loop;
  if not exists(select 1 from pg_proc where oid=to_regprocedure('private.studio2_request_is_service_role()')
      and pg_get_userbyid(proowner)='postgres'
      and md5(pg_get_functiondef(oid))='84d3f05e5f537908732a3875ba0178e6'
      and md5(coalesce(array_to_string(proacl::text[],','),''))='341a58cafc38a872c684592babc76f83') then
    raise exception 'S13 batch current hosted helper fingerprint differs' using errcode='55000';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
    and c.relname in ('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs')) then
    raise exception 'S13 recovery blocked: target already exists; reconcile effects first' using errcode='55000';
  end if;
  foreach v_name in array array[
    'v3_migration_contracts_pkey','v3_schema_compatibility_pkey','v3_schema_compatibility_history_pkey',
    'v3_backfill_jobs_pkey','v3_migration_parity_runs_pkey','v3_migration_parity_runs_sequence_key',
    'v3_schema_compatibility_history_id_seq','v3_migration_parity_runs_sequence_seq'
  ] loop
    if to_regclass(format('private.%I',v_name)) is not null then
      raise exception 'S13 batch implicit relation name collision: %',v_name using errcode='55000';
    end if;
  end loop;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs')) and exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='private'
     and t.typname in ('v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs',
     '_v3_migration_contracts','_v3_schema_compatibility','_v3_schema_compatibility_history','_v3_backfill_jobs','_v3_migration_parity_runs')) then
    raise exception 'S13 batch implicit table type name collision' using errcode='55000';
  end if;
  -- The 20-Nov hosted bounded catalog/definition check identified exactly one
  -- relevant provider-owned DDL handler: extensions.pgrst_ddl_watch(), which
  -- sends only NOTIFY pgrst, 'reload schema' for supported non-temp DDL.
  -- Permit ONLY its byte-fingerprinted known definition. No handler is disabled,
  -- replaced, granted new privileges, or excluded from transaction execution.
  -- Every other relevant DDL handler (including a modified watcher) is NO-GO.
  if exists (
    select 1
      from pg_event_trigger e
      join pg_proc p on p.oid=e.evtfoid
      join pg_namespace n on n.oid=p.pronamespace
      join pg_language l on l.oid=p.prolang
     where e.evtenabled in ('O','A')
       and e.evtevent in ('ddl_command_start','ddl_command_end')
       and (e.evttags is null or e.evttags && array['CREATE TABLE','CREATE INDEX','CREATE FUNCTION','COMMENT','GRANT','REVOKE'])
       and not (
         e.evtname='pgrst_ddl_watch'
         and e.evtevent='ddl_command_end'
         and e.evtenabled='O'
         and e.evttags is null
         and n.nspname='extensions'
         and p.proname='pgrst_ddl_watch'
         and pg_get_userbyid(p.proowner)='supabase_admin'
         and p.prokind='f' and not p.prosecdef
         and l.lanname='plpgsql'
         and md5(pg_get_functiondef(p.oid))='afaad7193dcf8f81e728d2bedb85e43e'
       )
  ) then
    raise exception 'S13 batch unqualified DDL event handler (only pinned PostgREST watcher allowed)' using errcode='55000';
  end if;
  if not pg_try_advisory_xact_lock(1395733297,1) then
    raise exception 'S13 batch another installation is active' using errcode='55P03';
  end if;
end
$s13_first_batch_preconditions$;
