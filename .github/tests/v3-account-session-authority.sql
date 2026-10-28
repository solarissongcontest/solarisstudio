begin;

-- Local/disposable-only account + session authority rehearsal.
-- The caller script refuses hosted Supabase before this file is executed.

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('27184517-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'account-owner@local.invalid', now(), now()),
  ('27184517-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'account-admin@local.invalid', now(), now()),
  ('27184517-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'account-foreign@local.invalid', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('27184517-0000-4000-8000-000000000011', '27184517-0000-4000-8000-000000000001', now(), now()),
  ('27184517-0000-4000-8000-000000000012', '27184517-0000-4000-8000-000000000002', now(), now()),
  ('27184517-0000-4000-8000-000000000013', '27184517-0000-4000-8000-000000000003', now(), now());

insert into public.countries (id, name, short_code)
values ('27184517-0000-4000-8000-000000000021', 'Authority Testland', 'ATX');

-- The admin fixture uses the same canonical permission engine role assignment
-- that Organizer commands consume. No user_roles compatibility shortcut.
insert into public.studio2_role_assignments (user_id, role_key, edition_id, expires_at, assigned_by)
values ('27184517-0000-4000-8000-000000000002', 'organizer', null, null, null)
on conflict on constraint studio2_role_assignments_scope_unique do nothing;

-- Canonical self-claim succeeds under the authenticated actor/session.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '27184517-0000-4000-8000-000000000001',
    'role', 'authenticated',
    'session_id', '27184517-0000-4000-8000-000000000011'
  )::text,
  true
);
set local role authenticated;

select public.v3_claim_country_account(
  '27184517-0000-4000-8000-000000000021',
  '27184517-0000-4000-8000-000000000101',
  'account-authority-claim'
);

-- Retry with a different transport operation reconciles to canonical state
-- instead of inserting a second account row.
select public.claim_country_account('27184517-0000-4000-8000-000000000021');

select public.v3_set_owned_hod_auto_assign(
  false,
  '27184517-0000-4000-8000-000000000102',
  'account-authority-hod-setting'
);

-- Authenticated clients no longer have raw account DML even for their own row.
do $test$
begin
  begin
    update public.country_accounts
    set hod_auto_assign_future = true
    where user_id = '27184517-0000-4000-8000-000000000001';
    raise exception 'authenticated raw country_accounts UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.country_accounts (user_id, country_id)
    values (
      '27184517-0000-4000-8000-000000000003',
      '27184517-0000-4000-8000-000000000021'
    );
    raise exception 'authenticated raw country_accounts INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

reset role;

-- An unrelated actor cannot change the owner's account setting.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '27184517-0000-4000-8000-000000000003',
    'role', 'authenticated',
    'session_id', '27184517-0000-4000-8000-000000000013'
  )::text,
  true
);
set local role authenticated;
do $test$
begin
  begin
    perform public.v3_set_owned_hod_auto_assign(
      true,
      '27184517-0000-4000-8000-000000000103',
      'foreign-account-setting'
    );
    raise exception 'foreign account setting unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;
reset role;

-- Organizer status mutation is capability-checked and CAS-protected.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '27184517-0000-4000-8000-000000000002',
    'role', 'authenticated',
    'session_id', '27184517-0000-4000-8000-000000000012'
  )::text,
  true
);
set local role authenticated;
do $test$
declare
  v_expected timestamptz;
  v_result jsonb;
begin
  select updated_at into v_expected
  from public.country_accounts
  where user_id = '27184517-0000-4000-8000-000000000001';

  v_result := public.v3_set_country_account_status(
    '27184517-0000-4000-8000-000000000001',
    'suspended',
    'authority rehearsal',
    v_expected,
    '27184517-0000-4000-8000-000000000104',
    'account-authority-suspend'
  );

  if v_result ->> 'status' is distinct from 'suspended' then
    raise exception 'canonical account status mutation did not persist';
  end if;

  begin
    perform public.v3_set_country_account_status(
      '27184517-0000-4000-8000-000000000001',
      'active',
      null,
      v_expected,
      '27184517-0000-4000-8000-000000000105',
      'account-authority-stale-cas'
    );
    raise exception 'stale account CAS unexpectedly succeeded';
  exception when serialization_failure then
    null;
  end;
end
$test$;
reset role;

-- service_role is operational, not account/session mutation authority.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $test$
begin
  begin
    update public.country_accounts
    set status = 'active';
    raise exception 'service_role raw account UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.studio2_account_session_revocations (
      auth_session_id,
      user_id,
      session_handle,
      revoked_at,
      reason
    ) values (
      '27184517-0000-4000-8000-000000000099',
      '27184517-0000-4000-8000-000000000001',
      repeat('a', 64),
      now(),
      'raw-service-role-probe'
    );
    raise exception 'service_role raw revocation tombstone INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;
reset role;

-- Structural/catalog invariants: no API role has canonical DML and all account
-- mutation APIs resolve to the governed command family.
do $test$
declare
  v_role text;
  v_definition text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.country_accounts', 'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'direct country_accounts DML remains for %', v_role;
    end if;
    if has_table_privilege(v_role, 'public.studio2_account_session_revocations', 'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'direct session tombstone DML remains for %', v_role;
    end if;
  end loop;

  if not has_function_privilege(
    'authenticated',
    'public.v3_claim_country_account(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'canonical account claim is not executable by authenticated';
  end if;

  if has_function_privilege(
    'service_role',
    'public.v3_claim_country_account(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role can impersonate canonical account claim';
  end if;

  if has_function_privilege(
    'service_role',
    'public.admin_set_country_account_status(uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'legacy status transport remains service_role executable';
  end if;

  if has_function_privilege('authenticated', 'public.claim_country_from_signup()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.claim_country_from_signup()', 'EXECUTE') then
    raise exception 'signup trigger function is externally executable';
  end if;

  select pg_get_functiondef('public.claim_country_account(uuid)'::regprocedure)
  into v_definition;
  if position('v3_claim_country_account' in v_definition) = 0
     or position('insert into public.country_accounts' in lower(v_definition)) > 0 then
    raise exception 'legacy claim remains an independent account writer';
  end if;

  select pg_get_functiondef('public.admin_set_country_account_status(uuid,text,text)'::regprocedure)
  into v_definition;
  if position('v3_set_country_account_status' in v_definition) = 0
     or position('update public.country_accounts' in lower(v_definition)) > 0 then
    raise exception 'legacy status transport remains an independent account writer';
  end if;

  select pg_get_functiondef('public.set_owned_hod_auto_assign(boolean)'::regprocedure)
  into v_definition;
  if position('v3_set_owned_hod_auto_assign' in v_definition) = 0
     or position('update public.country_accounts' in lower(v_definition)) > 0 then
    raise exception 'legacy HOD setting remains an independent account writer';
  end if;

  if (
    select p.provolatile
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'v3_require_active_auth_session'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) is distinct from 'v' then
    raise exception 'active-session guard is not VOLATILE';
  end if;

  select pg_get_functiondef('private.v3_require_active_auth_session()'::regprocedure)
  into v_definition;
  if position('FOR KEY SHARE' in upper(v_definition)) = 0 then
    raise exception 'active-session guard does not serialize against revocation';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = relation.relnamespace
    where namespace_row.nspname = 'auth'
      and relation.relname = 'refresh_tokens'
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid) ilike '%references auth.sessions%on delete cascade%'
  ) then
    raise exception 'refresh-token lifecycle is not bound to auth.sessions deletion';
  end if;
end
$test$;

-- Auth signup and its canonical trigger claim ownership atomically. The Edge
-- caller only reads this committed result; it cannot insert a peer account.
reset role;
select set_config('request.jwt.claims', '{}', true);
insert into public.countries(id,name,short_code)
values ('27184517-0000-4000-8000-000000000031','Signup Authority Testland','ASX');
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
values ('27184517-0000-4000-8000-000000000032','authenticated','authenticated','signup-authority@local.invalid',
  '{"account_type":"country","country_id":"27184517-0000-4000-8000-000000000031","instagram_username":"signup_authority","display_name":"Signup Authority"}',now(),now());
do $signup$
begin
  if (select count(*) from public.country_accounts where user_id='27184517-0000-4000-8000-000000000032'
      and country_id='27184517-0000-4000-8000-000000000031' and instagram_username='signup_authority') <> 1 then
    raise exception 'Auth signup did not atomically establish canonical account ownership';
  end if;
  begin
    insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
    values ('27184517-0000-4000-8000-000000000033','authenticated','authenticated','signup-race@local.invalid',
      '{"account_type":"country","country_id":"27184517-0000-4000-8000-000000000031","instagram_username":"signup_race","display_name":"Signup Race"}',now(),now());
    raise exception 'Competing signup unexpectedly claimed an owned country';
  exception when unique_violation then null;
  end;
  if exists(select 1 from auth.users where id='27184517-0000-4000-8000-000000000033') then
    raise exception 'Failed account claim left an orphan Auth identity';
  end if;
end
$signup$;
rollback;
