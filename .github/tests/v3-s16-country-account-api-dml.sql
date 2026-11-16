\set ON_ERROR_STOP on
-- Run only against disposable S16 local or networkless PG17.11 recovery.
do $pre$
begin
 if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or not exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.country-account-api-dml-retirement')
 then raise exception 'Country S16 execution requires exact local migration'
   using errcode='55000'; end if;
end $pre$;

-- Even hostile transaction-local marker injection must not restore API table
-- DML. Actual SQLSTATE insufficient_privilege is required for each operation.
begin;
set local role anon;
select set_config('studio2.platform_recovery_write','on',true);
select set_config('studio2.confirmation_maintenance_write','on',true);
do $deny$
declare v_sql text;
begin
 if current_user <> 'anon' then raise exception 'wrong actor';end if;
 foreach v_sql in array array[
  'insert into public.country_accounts default values',
  'update public.country_accounts set status=status where false',
  'delete from public.country_accounts where false',
  'truncate public.country_accounts'
 ] loop
   begin
     execute v_sql;
     raise exception 'COUNTRY S16 direct anonymous DML succeeded: %',v_sql;
   exception when insufficient_privilege then null;
   end;
 end loop;
 raise notice 'PASS: 4 actual anonymous country-account SQL mutations denied';
end $deny$;
rollback;

begin;
set local role authenticated;
select set_config('studio2.platform_recovery_write','on',true);
select set_config('studio2.confirmation_maintenance_write','on',true);
do $deny$
declare v_sql text;
begin
 if current_user <> 'authenticated' then raise exception 'wrong actor';end if;
 foreach v_sql in array array[
  'insert into public.country_accounts default values',
  'update public.country_accounts set status=status where false',
  'delete from public.country_accounts where false',
  'truncate public.country_accounts'
 ] loop
   begin
     execute v_sql;
     raise exception 'COUNTRY S16 direct authenticated DML succeeded: %',v_sql;
   exception when insufficient_privilege then null;
   end;
 end loop;
 raise notice 'PASS: 4 actual authenticated country-account SQL mutations denied';
end $deny$;
rollback;

begin;
set local role service_role;
select set_config('studio2.platform_recovery_write','on',true);
select set_config('studio2.confirmation_maintenance_write','on',true);
do $deny$
declare v_sql text;
begin
 if current_user <> 'service_role' then raise exception 'wrong actor';end if;
 foreach v_sql in array array[
  'insert into public.country_accounts default values',
  'update public.country_accounts set status=status where false',
  'delete from public.country_accounts where false',
  'truncate public.country_accounts'
 ] loop
   begin
     execute v_sql;
     raise exception 'COUNTRY S16 direct service-role DML succeeded: %',v_sql;
   exception when insufficient_privilege then null;
   end;
 end loop;
 raise notice 'PASS: 4 actual service-role country-account SQL mutations denied';
end $deny$;
rollback;

-- Positive tests are deliberately isolated from the current-main catalog
-- collector. The PG17.11 owner-recovery harness creates a disposable clone,
-- inserts real auth.users rows AS supabase_auth_admin, and proves the original
-- signup trigger writes under its canonical owner. No Auth ownership grants
-- are added to postgres or any API role. The clone is dropped after execution.
\if :{?s16_country_positive}
do $signup$
begin
 if not exists(select 1 from public.country_accounts
   where user_id='74800000-0000-4000-8000-000000000021'
     and country_id='74800000-0000-4000-8000-000000000011'
     and instagram_username='s16countrytest')
   or not exists(select 1 from public.studio2_role_assignments
      where user_id='74800000-0000-4000-8000-000000000021'
        and role_key='hod' and edition_id is null)
 then raise exception 'Country signup owner trigger failed after API direct DML revocation'
   using errcode='55000';end if;
 raise notice 'PASS: canonical auth.users country signup trigger writes through owner despite revoked API DML';
end $signup$;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','74800000-0000-4000-8000-000000000022',true);
do $claim$
declare v_country uuid; v_enabled boolean;
begin
 if current_user <> 'authenticated'
    or not has_function_privilege(current_user,'public.claim_country_account(uuid)','EXECUTE')
    or not has_function_privilege(current_user,'public.set_owned_hod_auto_assign(boolean)','EXECUTE')
 then raise exception 'Country RPC caller lost EXECUTE permission' using errcode='55000'; end if;
 v_country := public.claim_country_account('74800000-0000-4000-8000-000000000012');
 if v_country is distinct from '74800000-0000-4000-8000-000000000012'
   or not exists(select 1 from public.country_accounts where user_id=auth.uid()
      and country_id=v_country and status='active')
   or not exists(select 1 from public.studio2_role_assignments
      where user_id=auth.uid() and role_key='hod' and edition_id is null)
 then raise exception 'S16 canonical country claim failed' using errcode='55000'; end if;
 v_enabled := public.set_owned_hod_auto_assign(false);
 if v_enabled is distinct from true
    or not exists(select 1 from public.country_accounts
      where user_id=auth.uid() and hod_auto_assign_future=false)
 then raise exception 'S16 canonical HoD preference update failed' using errcode='55000';end if;
 begin
   perform public.admin_set_country_account_status(auth.uid(),'suspended','unauthorized');
   raise exception 'S16 unprivileged Organizer moderation succeeded';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: real authenticated owner claim and HoD mutation work; unauthorized moderation denied';
end $claim$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','74800000-0000-4000-8000-000000000023',true);
do $moderator$
declare v_result jsonb;
begin
 if current_user <> 'authenticated'
    or not public.studio2_access_allowed('delegation.manage',null,true)
 then raise exception 'S16 Organizer actor does not have source-defined delegation.manage' using errcode='55000'; end if;
 v_result := public.admin_set_country_account_status(
   '74800000-0000-4000-8000-000000000021','suspended','S16 authorized local moderation');
 if v_result->>'status' is distinct from 'suspended'
    or v_result->>'suspension_reason' is distinct from 'S16 authorized local moderation'
    or not exists(select 1 from public.country_accounts where
      user_id='74800000-0000-4000-8000-000000000021'
      and status='suspended' and suspended_by=auth.uid())
 then raise exception 'S16 authorized Organizer country moderation did not persist' using errcode='55000';end if;
 v_result := public.admin_set_country_account_status(
   '74800000-0000-4000-8000-000000000021','active',null);
 if v_result->>'status' is distinct from 'active'
   or exists(select 1 from public.country_accounts where
     user_id='74800000-0000-4000-8000-000000000021'
       and (status<>'active' or suspension_reason is not null or suspended_by is not null))
 then raise exception 'S16 authorized Organizer reactivation failed' using errcode='55000';end if;
 raise notice 'PASS: authorized Organizer suspension/reactivation uses canonical owner command';
end $moderator$;
rollback;
\endif
