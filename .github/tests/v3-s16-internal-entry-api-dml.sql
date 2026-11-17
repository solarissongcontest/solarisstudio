\set ON_ERROR_STOP on
-- Source-managed local PG17 only. 3 roles × 4 mutations = 12 true ACL denials.
do $s16_ready$
begin
  if current_user<>'postgres'
    or current_setting('server_version_num')::integer / 10000<>17
    or not exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.internal-entry-api-dml-retirement')
  then raise exception 'S16 internal Entry role rehearsal needs an isolated installed candidate'
    using errcode='55000';end if;
end $s16_ready$;

begin;
set local role anon;
do $s16_denials$
declare v_sql text; v_count int:=0;
begin
  if current_user<>'anon' then raise exception 'S16 expected anon SQL role';end if;
  foreach v_sql in array array[
    'insert into public.internal_entries default values',
    'update public.internal_entries set review_status=review_status where false',
    'delete from public.internal_entries where false',
    'truncate table public.internal_entries'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 direct internal Entry DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table internal_entries%'
      then raise exception 'S16 internal Entry rejection not from table ACL: %',sqlerrm;end if;
      v_count:=v_count+1;
    end;
  end loop;
  if v_count<>4 then raise exception 'S16 expected 4 internal Entry table ACL denials';end if;
  raise notice 'PASS: 4 internal Entry SQL denials for anon';
end $s16_denials$;
rollback;

begin;
set local role authenticated;
do $s16_denials$
declare v_sql text; v_count int:=0;
begin
  if current_user<>'authenticated' then raise exception 'S16 expected authenticated SQL role';end if;
  foreach v_sql in array array[
    'insert into public.internal_entries default values',
    'update public.internal_entries set review_status=review_status where false',
    'delete from public.internal_entries where false',
    'truncate table public.internal_entries'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 direct internal Entry DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table internal_entries%'
      then raise exception 'S16 internal Entry rejection not from table ACL: %',sqlerrm;end if;
      v_count:=v_count+1;
    end;
  end loop;
  if v_count<>4 then raise exception 'S16 expected 4 internal Entry table ACL denials';end if;
  raise notice 'PASS: 4 internal Entry SQL denials for authenticated';
end $s16_denials$;
rollback;

begin;
set local role service_role;
do $s16_denials$
declare v_sql text; v_count int:=0;
begin
  if current_user<>'service_role' then raise exception 'S16 expected service_role SQL role';end if;
  foreach v_sql in array array[
    'insert into public.internal_entries default values',
    'update public.internal_entries set review_status=review_status where false',
    'delete from public.internal_entries where false',
    'truncate table public.internal_entries'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 direct internal Entry DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table internal_entries%'
      then raise exception 'S16 internal Entry rejection not from table ACL: %',sqlerrm;end if;
      v_count:=v_count+1;
    end;
  end loop;
  if v_count<>4 then raise exception 'S16 expected 4 internal Entry table ACL denials';end if;
  raise notice 'PASS: 4 internal Entry SQL denials for service_role';
end $s16_denials$;
rollback;

do $s16_review$
begin
  if not has_function_privilege('authenticated',
      'public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)','EXECUTE')
    or has_function_privilege('anon',
      'public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)','EXECUTE')
    or not has_table_privilege('service_role','public.internal_entries','SELECT')
  then raise exception 'S16 canonical CAS Entry review or canonical reader regressed';end if;
  raise notice 'PASS: canonical revision-scoped Entry review remains available';
end $s16_review$;
