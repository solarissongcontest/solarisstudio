-- Executed only by the guarded, loopback-only S16 catalog rehearsal.
-- This is a *runtime* API-role probe, not just inspection of pg_catalog.
-- Refuse an unexpected table or canonical RPC before attempting mutations.
do $pre$
begin
  if current_setting('server_version_num')::integer / 10000 <> 17
     or current_user <> 'postgres'
     or to_regclass('public.studio2_show_publication_controls') is null
     or to_regclass('public.studio2_show_publication_executions') is null
     or to_regprocedure('public.studio2_publish_due_show_publications()') is null
     or not exists (
       select 1 from private.v3_migration_contracts
       where migration_key = 'v3.s16.publication-direct-table-retirement'
     )
  then
    raise exception 'S16 publication role probe refused unqualified candidate' using errcode = '55000';
  end if;
end
$pre$;

-- Local authenticated publishing has its own fully seeded, real-role,
-- idempotency/retry probe in .github/scripts/v3-s16-publication-api-local.sh.
-- The service scheduler must still run as a real API role after direct DML
-- retirement; roll back any synthetic side effects.
begin;
set local role service_role;
select public.studio2_publish_due_show_publications();
rollback;

-- Three actual API-role sessions, including the RLS-bypassing service role.
-- Require SQLSTATE 42501, rather than treating missing fixtures or RLS
-- constraint errors as successful denials.
begin;
set local role anon;
do $assert$
declare
  v_table text;
  v_sql text;
begin
  foreach v_table in array array[
    'public.studio2_show_publication_controls',
    'public.studio2_show_publication_executions'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values', v_table),
      format('update %s set show_id = show_id where false', v_table),
      format('delete from %s where false', v_table),
      format('truncate table %s', v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct publication mutation unexpectedly succeeded: %', v_sql;
      exception when insufficient_privilege then
        null;
      end;
    end loop;
  end loop;
end
$assert$;
rollback;

begin;
set local role authenticated;
do $assert$
declare
  v_table text;
  v_sql text;
begin
  foreach v_table in array array[
    'public.studio2_show_publication_controls',
    'public.studio2_show_publication_executions'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values', v_table),
      format('update %s set show_id = show_id where false', v_table),
      format('delete from %s where false', v_table),
      format('truncate table %s', v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct publication mutation unexpectedly succeeded: %', v_sql;
      exception when insufficient_privilege then
        null;
      end;
    end loop;
  end loop;
end
$assert$;
rollback;

begin;
set local role service_role;
do $assert$
declare
  v_table text;
  v_sql text;
begin
  foreach v_table in array array[
    'public.studio2_show_publication_controls',
    'public.studio2_show_publication_executions'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values', v_table),
      format('update %s set show_id = show_id where false', v_table),
      format('delete from %s where false', v_table),
      format('truncate table %s', v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct publication mutation unexpectedly succeeded: %', v_sql;
      exception when insufficient_privilege then
        null;
      end;
    end loop;
  end loop;
end
$assert$;
rollback;
