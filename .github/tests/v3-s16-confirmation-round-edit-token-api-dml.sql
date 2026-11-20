\set ON_ERROR_STOP on
-- Executed only on a completely installed isolated PostgreSQL 17 source chain.
do $ready$
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or not exists (select 1 from private.v3_migration_contracts
                    where migration_key='v3.s16.confirmation-round-edit-token-dml-retirement')
  then raise exception 'S16 P07 test requires local PG17 cutover' using errcode='55000';end if;
  if not has_function_privilege('authenticated',
      'public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)','EXECUTE')
     or not has_function_privilege('authenticated',
      'public.v3_submit_confirmation(jsonb,uuid,text,text)','EXECUTE')
     or not has_function_privilege('authenticated',
      'public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)','EXECUTE')
  then raise exception 'S16 P07 canonical Confirmation operation EXECUTE regressed';end if;
end
$ready$;

begin;
set local role anon;
do $denied$
declare v_table text;v_column text;v_sql text;v_count integer:=0;
begin
  if current_user <> 'anon' then raise exception 'Wrong P07 role';end if;
  foreach v_table in array array['public.submission_rounds','public.edit_tokens'] loop
    select a.attname into v_column from pg_attribute a
    where a.attrelid=to_regclass(v_table) and a.attnum>0
      and not a.attisdropped and a.attgenerated=''
    order by a.attnum limit 1;
    if v_column is null then raise exception 'Missing mutable P07 test column';end if;
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set %I=%I where false',v_table,v_column,v_column),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'anon P07 direct SQL unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'anon P07 denial was not table ACL: %',sqlerrm;end if;
        v_count:=v_count+1;
      end;
    end loop;
  end loop;
  if v_count<>8 then raise exception 'anon expected 8 ACL denials, got %',v_count;end if;
  raise notice 'PASS: 8 anon Confirmation round/token SQL DML denials';
end
$denied$;
rollback;

begin;
set local role authenticated;
do $denied$
declare v_table text;v_column text;v_sql text;v_count integer:=0;
begin
  if current_user <> 'authenticated' then raise exception 'Wrong P07 role';end if;
  foreach v_table in array array['public.submission_rounds','public.edit_tokens'] loop
    select a.attname into v_column from pg_attribute a
    where a.attrelid=to_regclass(v_table) and a.attnum>0
      and not a.attisdropped and a.attgenerated=''
    order by a.attnum limit 1;
    if v_column is null then raise exception 'Missing mutable P07 test column';end if;
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set %I=%I where false',v_table,v_column,v_column),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'authenticated P07 direct SQL unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'authenticated P07 denial was not table ACL: %',sqlerrm;end if;
        v_count:=v_count+1;
      end;
    end loop;
  end loop;
  if v_count<>8 then raise exception 'authenticated expected 8 ACL denials, got %',v_count;end if;
  raise notice 'PASS: 8 authenticated Confirmation round/token SQL DML denials';
end
$denied$;
rollback;

begin;
set local role service_role;
do $denied$
declare v_table text;v_column text;v_sql text;v_count integer:=0;
begin
  if current_user <> 'service_role' then raise exception 'Wrong P07 role';end if;
  foreach v_table in array array['public.submission_rounds','public.edit_tokens'] loop
    select a.attname into v_column from pg_attribute a
    where a.attrelid=to_regclass(v_table) and a.attnum>0
      and not a.attisdropped and a.attgenerated=''
    order by a.attnum limit 1;
    if v_column is null then raise exception 'Missing mutable P07 test column';end if;
    foreach v_sql in array array[
      format('insert into %s default values',v_table),
      format('update %s set %I=%I where false',v_table,v_column,v_column),
      format('delete from %s where false',v_table),
      format('truncate table %s',v_table)
    ] loop
      begin
        execute v_sql;
        raise exception 'service_role P07 direct SQL unexpectedly succeeded: %',v_sql;
      exception when insufficient_privilege then
        if sqlerrm not like '%permission denied for table %'
        then raise exception 'service_role P07 denial was not table ACL: %',sqlerrm;end if;
        v_count:=v_count+1;
      end;
    end loop;
  end loop;
  if v_count<>8 then raise exception 'service_role expected 8 ACL denials, got %',v_count;end if;
  raise notice 'PASS: 8 service_role Confirmation round/token SQL DML denials';
end
$denied$;
rollback;
