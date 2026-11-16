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

-- Validate owner-executed positive signup/claim/HoD flows after direct ACL
-- removal. No synthetic rows or auth users persist after this transaction.
begin;
insert into public.countries(id,name,short_code)
values
 ('74800000-0000-4000-8000-000000000011','S16 Country Signup','SCS'),
 ('74800000-0000-4000-8000-000000000012','S16 Country Claim','SCC');
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
values
 ('74800000-0000-4000-8000-000000000021','authenticated','authenticated',
  's16-country-signup@local.invalid',
  '{"account_type":"country","country_id":"74800000-0000-4000-8000-000000000011","instagram_username":"s16countrytest","display_name":"S16 Country Signup"}'::jsonb,
  now(),now()),
 ('74800000-0000-4000-8000-000000000022','authenticated','authenticated',
  's16-country-claim@local.invalid','{}'::jsonb,now(),now());
do $signup$
begin
 if not exists(select 1 from public.country_accounts
   where user_id='74800000-0000-4000-8000-000000000021'
     and country_id='74800000-0000-4000-8000-000000000011'
     and instagram_username='s16countrytest')
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
