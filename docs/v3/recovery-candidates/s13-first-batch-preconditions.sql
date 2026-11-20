-- Preconditions for ONLY the dark S13 foundation batch; no shared objects altered.
do $s13_first_batch_preconditions$
declare r record;
begin
  if current_setting('server_version_num') <> '170011'
     or session_user <> 'postgres' or current_user <> 'postgres'
     or current_setting('session_replication_role') <> 'origin' then
    raise exception 'S13 batch requires PG17.11, postgres owner session and origin triggers' using errcode='55000';
  end if;
  if not exists(select 1 from pg_roles where rolname='postgres' and not rolsuper and rolbypassrls and rolcanlogin)
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
  -- Supabase event handlers are not guessed or disabled. Unobserved handlers
  -- relevant to this batch must be separately qualified, otherwise fail closed.
  if exists(select 1 from pg_event_trigger where evtenabled in ('O','A')
     and evtevent in ('ddl_command_start','ddl_command_end')
     and (evttags is null or evttags && array['CREATE TABLE','CREATE INDEX','CREATE FUNCTION','COMMENT','GRANT','REVOKE'])) then
    raise exception 'S13 batch relevant DDL event triggers require explicit qualification' using errcode='55000';
  end if;
  if not pg_try_advisory_xact_lock(1395733297,1) then
    raise exception 'S13 batch another installation is active' using errcode='55P03';
  end if;
end
$s13_first_batch_preconditions$;
