\set ON_ERROR_STOP on
-- PostgreSQL 17 local disposable database only. Verify 4 canonical tables,
-- 3 API roles and 4 DML operations = 48 real table-ACL denial probes.
do $s16_ready$
begin
  if current_user<>'postgres'
    or current_setting('server_version_num')::integer / 10000<>17
    or not exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.integrity-api-table-dml-retirement')
  then raise exception 'S16 Integrity SQL probes require isolated source cutover'
    using errcode='55000';end if;
end $s16_ready$;

begin;
set local role anon;
do $s16_denials$
declare
  v_table text;
  v_sql text;
  v_probes integer := 0;
begin
  if current_user<>'anon' then raise exception 'S16 wrong SQL principal';end if;
  foreach v_table in array array[
    'public.integrity_cases',
    'public.integrity_case_events',
    'public.integrity_case_appeals',
    'public.integrity_case_evidence'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set id=id where false',v_table),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct Integrity API DML unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'S16 Integrity denied for non-table-ACL reason: %',sqlerrm;end if;
        v_probes := v_probes + 1;
      end;
    end loop;
  end loop;
  if v_probes<>16 then raise exception 'S16 expected 16 DML denials for anon, got %',v_probes;end if;
  raise notice 'PASS: 16 Integrity API-table DML denials for anon';
end $s16_denials$;
rollback;

begin;
set local role authenticated;
do $s16_denials$
declare
  v_table text;
  v_sql text;
  v_probes integer := 0;
begin
  if current_user<>'authenticated' then raise exception 'S16 wrong SQL principal';end if;
  foreach v_table in array array[
    'public.integrity_cases',
    'public.integrity_case_events',
    'public.integrity_case_appeals',
    'public.integrity_case_evidence'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set id=id where false',v_table),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct Integrity API DML unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'S16 Integrity denied for non-table-ACL reason: %',sqlerrm;end if;
        v_probes := v_probes + 1;
      end;
    end loop;
  end loop;
  if v_probes<>16 then raise exception 'S16 expected 16 DML denials for authenticated, got %',v_probes;end if;
  raise notice 'PASS: 16 Integrity API-table DML denials for authenticated';
end $s16_denials$;
rollback;

begin;
set local role service_role;
do $s16_denials$
declare
  v_table text;
  v_sql text;
  v_probes integer := 0;
begin
  if current_user<>'service_role' then raise exception 'S16 wrong SQL principal';end if;
  foreach v_table in array array[
    'public.integrity_cases',
    'public.integrity_case_events',
    'public.integrity_case_appeals',
    'public.integrity_case_evidence'
  ] loop
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set id=id where false',v_table),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'S16 direct Integrity API DML unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'S16 Integrity denied for non-table-ACL reason: %',sqlerrm;end if;
        v_probes := v_probes + 1;
      end;
    end loop;
  end loop;
  if v_probes<>16 then raise exception 'S16 expected 16 DML denials for service_role, got %',v_probes;end if;
  raise notice 'PASS: 16 Integrity API-table DML denials for service_role';
end $s16_denials$;
rollback;

-- The existing hostile Rules + Integrity browser rehearsal verifies both
-- anonymous reporting and authenticated Organizer findings/evidence/appeals,
-- with real API role JWTs. No synthetic owner grants are added.
do $s16_rpc$
begin
  if not has_function_privilege('anon','public.public_create_anonymous_integrity_case(text,text,text,text,text,text[],text,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)','EXECUTE')
    or not has_function_privilege('authenticated','public.reporter_submit_integrity_appeal(uuid,uuid,text)','EXECUTE')
    or not has_function_privilege('authenticated','public.admin_register_integrity_evidence(uuid,text,text,text,text,boolean)','EXECUTE')
  then raise exception 'S16 Integrity canonical RPC surface regressed';end if;
  raise notice 'PASS: Integrity authorized RPC grants preserved';
end $s16_rpc$;
