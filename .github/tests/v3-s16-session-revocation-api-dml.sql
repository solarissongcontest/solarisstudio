\set ON_ERROR_STOP on
-- Disposable, exact-migration local PostgreSQL 17 authority test only.
do $s16_pre$
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or not exists(select 1 from private.v3_migration_contracts
       where migration_key='v3.s16.session-revocation-api-dml-retirement')
  then raise exception 'S16 revocation SQL probe requires installed local authority cutover'
    using errcode='55000';end if;
end $s16_pre$;

-- Denials must be actual table ACL 42501, never a broken FK, RLS visibility,
-- missing role, or malformed INSERT. These statements never persist rows.
begin;
set local role anon;
do $s16_denials$
declare v_sql text;
begin
  if current_user<>'anon' then raise exception 'wrong SQL principal'; end if;
  foreach v_sql in array array[
    'insert into public.studio2_account_session_revocations default values',
    'update public.studio2_account_session_revocations set reason=reason where false',
    'delete from public.studio2_account_session_revocations where false',
    'truncate table public.studio2_account_session_revocations'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 anonymous session tombstone DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table studio2_account_session_revocations%'
      then raise exception 'S16 anonymous SQL failed for non-table-ACL reason: %',sqlerrm;end if;
    end;
  end loop;
  raise notice 'PASS: 4 direct anonymous session tombstone mutations denied at table ACL';
end $s16_denials$;
rollback;

begin;
set local role authenticated;
do $s16_denials$
declare v_sql text;
begin
  if current_user<>'authenticated' then raise exception 'wrong SQL principal'; end if;
  foreach v_sql in array array[
    'insert into public.studio2_account_session_revocations default values',
    'update public.studio2_account_session_revocations set reason=reason where false',
    'delete from public.studio2_account_session_revocations where false',
    'truncate table public.studio2_account_session_revocations'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 authenticated session tombstone DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table studio2_account_session_revocations%'
      then raise exception 'S16 authenticated SQL failed for non-table-ACL reason: %',sqlerrm;end if;
    end;
  end loop;
  raise notice 'PASS: 4 direct authenticated session tombstone mutations denied at table ACL';
end $s16_denials$;
rollback;

begin;
set local role service_role;
do $s16_denials$
declare v_sql text;
begin
  if current_user<>'service_role' then raise exception 'wrong SQL principal'; end if;
  foreach v_sql in array array[
    'insert into public.studio2_account_session_revocations default values',
    'update public.studio2_account_session_revocations set reason=reason where false',
    'delete from public.studio2_account_session_revocations where false',
    'truncate table public.studio2_account_session_revocations'
  ] loop
    begin
      execute v_sql;
      raise exception 'S16 service-role session tombstone DML unexpectedly succeeded: %',v_sql;
    exception when insufficient_privilege then
      if sqlerrm not like '%permission denied for table studio2_account_session_revocations%'
      then raise exception 'S16 service-role SQL failed for non-table-ACL reason: %',sqlerrm;end if;
    end;
  end loop;
  if not has_table_privilege(current_user,'public.studio2_account_session_revocations','SELECT')
  then raise exception 'S16 service-only session revocation read lost';end if;
  perform count(*) from public.studio2_account_session_revocations;
  raise notice 'PASS: 4 service-role session tombstone mutations denied; SELECT survives';
end $s16_denials$;
rollback;

-- Full positive Auth-session revoke, replay, signed-session invalidation,
-- privacy-safe projection, cross-user and current-session denials run through
-- the existing independent V3 account-session management rehearsal.
do $s16_canonical$
begin
  if not has_function_privilege('authenticated',
         'public.v3_revoke_session(text,uuid,text)','EXECUTE')
     or has_function_privilege('anon',
         'public.v3_revoke_session(text,uuid,text)','EXECUTE')
     or has_function_privilege('service_role',
         'public.v3_revoke_session(text,uuid,text)','EXECUTE')
  then raise exception 'S16 canonical R3 session revoke EXECUTE grant changed'
       using errcode='55000'; end if;
  raise notice 'PASS: canonical authenticated session RPC callable; anon/service EXECUTE denied';
end $s16_canonical$;
