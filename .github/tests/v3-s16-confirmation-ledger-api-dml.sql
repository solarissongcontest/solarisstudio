\set ON_ERROR_STOP on
-- Disposable, fully replayed PostgreSQL 17 only. 36 direct-table denials.
do $s16_ready$
begin
  if current_user<>'postgres'
    or current_setting('server_version_num')::integer / 10000<>17
    or not exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.confirmation-ledger-api-dml-retirement')
  then raise exception 'S16 Confirmation ledger test requires local installed cutover'
    using errcode='55000';end if;
end $s16_ready$;

begin;
set local role anon;
do $s16_denials$
declare v_sql text; v_table text; v_count integer:=0;
begin
  if current_user<>'anon' then raise exception 'S16 wrong Confirmation SQL role';end if;
  foreach v_table in array array[
    'public.submission_versions',
    'public.studio2_confirmation_requirements',
    'public.studio2_confirmation_round_versions'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set id=id where false',v_table),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct Confirmation ledger DML unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'S16 failure was not table ACL: %',sqlerrm;end if;
        v_count:=v_count+1;
      end;
    end loop;
  end loop;
  if v_count<>12 then raise exception 'S16 role anon expected 12 denials, got %',v_count;end if;
  raise notice 'PASS: 12 denied Confirmation ledger SQL writes for anon';
end $s16_denials$;
rollback;

begin;
set local role authenticated;
do $s16_denials$
declare v_sql text; v_table text; v_count integer:=0;
begin
  if current_user<>'authenticated' then raise exception 'S16 wrong Confirmation SQL role';end if;
  foreach v_table in array array[
    'public.submission_versions',
    'public.studio2_confirmation_requirements',
    'public.studio2_confirmation_round_versions'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set id=id where false',v_table),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct Confirmation ledger DML unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'S16 failure was not table ACL: %',sqlerrm;end if;
        v_count:=v_count+1;
      end;
    end loop;
  end loop;
  if v_count<>12 then raise exception 'S16 role authenticated expected 12 denials, got %',v_count;end if;
  raise notice 'PASS: 12 denied Confirmation ledger SQL writes for authenticated';
end $s16_denials$;
rollback;

begin;
set local role service_role;
do $s16_denials$
declare v_sql text; v_table text; v_count integer:=0;
begin
  if current_user<>'service_role' then raise exception 'S16 wrong Confirmation SQL role';end if;
  foreach v_table in array array[
    'public.submission_versions',
    'public.studio2_confirmation_requirements',
    'public.studio2_confirmation_round_versions'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set id=id where false',v_table),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct Confirmation ledger DML unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'S16 failure was not table ACL: %',sqlerrm;end if;
        v_count:=v_count+1;
      end;
    end loop;
  end loop;
  if v_count<>12 then raise exception 'S16 role service_role expected 12 denials, got %',v_count;end if;
  raise notice 'PASS: 12 denied Confirmation ledger SQL writes for service_role';
end $s16_denials$;
rollback;

do $s16_calls$
begin
  if not has_function_privilege('authenticated','public.v3_submit_confirmation(jsonb,uuid,text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)','EXECUTE')
    or not has_function_privilege('authenticated','public.admin_restore_confirmation_version(uuid,uuid,text)','EXECUTE')
  then raise exception 'S16 Confirmation canonical RPC grants regressed';end if;
  raise notice 'PASS: V3 Confirmation, Organizer round change, version restore executable';
end $s16_calls$;
