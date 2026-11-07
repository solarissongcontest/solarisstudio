\set ON_ERROR_STOP on
-- Run only against disposable current main before applying the feature delta.
-- Demonstrate effective worker writes, rather than inferring risk from grants.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values('27184517-0000-4000-8000-000000000501','authenticated','authenticated',
       'authority-baseline@local.invalid',now(),now());
insert into public.countries(id,name,short_code)
values('27184517-0000-4000-8000-000000000521','Authority Baseline','ABX');
insert into public.country_accounts(user_id,country_id)
values('27184517-0000-4000-8000-000000000501','27184517-0000-4000-8000-000000000521');
set local role service_role;
update public.country_accounts set status='suspended'
where user_id='27184517-0000-4000-8000-000000000501';
insert into public.studio2_account_session_revocations(auth_session_id,user_id,session_handle,reason)
values('27184517-0000-4000-8000-000000000511','27184517-0000-4000-8000-000000000501',repeat('b',64),'reconciled');
reset role;
do $baseline$
begin
  if not exists(select 1 from public.country_accounts
    where user_id='27184517-0000-4000-8000-000000000501' and status='suspended')
    or not exists(select 1 from public.studio2_account_session_revocations
    where auth_session_id='27184517-0000-4000-8000-000000000511') then
    raise exception 'Baseline raw worker mutation did not persist';
  end if;
  raise notice 'BASELINE VERIFIED: raw worker can mutate account security state and session revocation history on pre-upgrade main';
end
$baseline$;
rollback;
