\set ON_ERROR_STOP on
-- Run ONLY against an owned disposable, exact-source-migration PostgreSQL 17
-- stack. The full S14 and 66-country stateful suites independently exercise
-- authorized edition transition, operation receipt/replay and Archive denial.
do $s16_ready$
begin
  if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or not exists (select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.edition-runtime-api-dml-retirement')
  then raise exception 'S16 runtime authority test requires isolated applied source migration'
     using errcode='55000'; end if;
end $s16_ready$;

begin;
set local role anon;
do $s16_denials$
declare v_sql text;
begin
  if current_user <> 'anon' then raise exception 'S16 wrong anon principal'; end if;
  foreach v_sql in array array[
    'insert into public.studio2_edition_runtime default values',
    'update public.studio2_edition_runtime set state=state where false',
    'delete from public.studio2_edition_runtime where false',
    'truncate table public.studio2_edition_runtime'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 anon direct runtime DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table studio2_edition_runtime%'
      then raise exception 'S16 anon DML was not denied at table ACL: %',sqlerrm; end if;
    end;
  end loop;
  raise notice 'PASS: 4 anon runtime table ACL denials';
end $s16_denials$;
rollback;

begin;
set local role authenticated;
do $s16_denials$
declare v_sql text;
begin
  if current_user <> 'authenticated' then raise exception 'S16 wrong authenticated principal'; end if;
  foreach v_sql in array array[
    'insert into public.studio2_edition_runtime default values',
    'update public.studio2_edition_runtime set state=state where false',
    'delete from public.studio2_edition_runtime where false',
    'truncate table public.studio2_edition_runtime'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 authenticated direct runtime DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table studio2_edition_runtime%'
      then raise exception 'S16 authenticated DML was not denied at table ACL: %',sqlerrm; end if;
    end;
  end loop;
  raise notice 'PASS: 4 authenticated runtime table ACL denials';
end $s16_denials$;
rollback;

begin;
set local role service_role;
do $s16_denials$
declare v_sql text;
begin
  if current_user <> 'service_role' then raise exception 'S16 wrong service principal'; end if;
  foreach v_sql in array array[
    'insert into public.studio2_edition_runtime default values',
    'update public.studio2_edition_runtime set state=state where false',
    'delete from public.studio2_edition_runtime where false',
    'truncate table public.studio2_edition_runtime'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 service direct runtime DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table studio2_edition_runtime%'
      then raise exception 'S16 service DML was not denied at table ACL: %',sqlerrm; end if;
    end;
  end loop;
  if not has_table_privilege(current_user,'public.studio2_edition_runtime','SELECT')
  then raise exception 'S16 service runtime SELECT denied';end if;
  perform count(*) from public.studio2_edition_runtime;
  raise notice 'PASS: 4 service runtime table ACL denials and SELECT preserved';
end $s16_denials$;
rollback;

do $s16_canonical$
begin
  if not has_function_privilege('authenticated',
      'public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE')
     or has_function_privilege('anon',
      'public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE')
     or has_function_privilege('authenticated',
      'private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE')
  then raise exception 'S16 canonical transition RPC grants drift';end if;
  raise notice 'PASS: canonical V3 edition command and private helper isolation preserved';
end $s16_canonical$;
