-- TG5A isolated rollback-only authorization and application lifecycle rehearsal.
-- Never run this against production. Invoke via local-loopback-only shell script.
\set ON_ERROR_STOP on
begin;

do $fixtures$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_organization uuid;
begin
  select id into v_organization from public.world_organizations where slug='guard';
  if v_organization is null then
    raise exception 'TG5_WITHDRAW_GUARD_SEED_MISSING';
  end if;
  if to_regprocedure('public.world_withdraw_guard_application_v1(uuid,uuid,uuid,bigint,uuid,text)') is null then
    raise exception 'TG5_WITHDRAW_RPC_MISSING';
  end if;
  if has_function_privilege('anon',
       'public.world_withdraw_guard_application_v1(uuid,uuid,uuid,bigint,uuid,text)','EXECUTE')
     or has_table_privilege('authenticated','public.world_membership_applications','UPDATE')
     or has_table_privilege('authenticated','public.world_membership_applications','INSERT') then
    raise exception 'TG5_WITHDRAW_UNEXPECTED_CLIENT_WRITE_AUTHORITY';
  end if;

  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_owner,'authenticated','authenticated',v_owner::text || '@tg5-withdraw.invalid',now(),now()),
    (v_other,'authenticated','authenticated',v_other::text || '@tg5-withdraw.invalid',now(),now());
  insert into public.countries(id,name,short_code)
  values (v_country,'TG5 Withdrawal Fixture Country','XWZ');
  insert into public.country_accounts(user_id,country_id,status)
  values(v_owner,v_country,'active');
  perform set_config('solaris.tg5_withdraw_fixture',
    jsonb_build_object('owner',v_owner,'other',v_other,
      'country',v_country,'organization',v_organization)::text,true);
end
$fixtures$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $submit_and_withdraw$
declare
  v jsonb := current_setting('solaris.tg5_withdraw_fixture')::jsonb;
  v_submit jsonb;
  v_response jsonb;
  v_application uuid;
  v_operation uuid := gen_random_uuid();
  v_key text := 'tg5-withdraw:' || gen_random_uuid()::text;
begin
  perform set_config('request.jwt.claim.sub',v->>'owner',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'owner','role','authenticated')::text,true);
  if current_user <> 'authenticated'
     or auth.uid() is distinct from (v->>'owner')::uuid
     or not public.world_access_allowed('world.membership.apply',
        (v->>'organization')::uuid,(v->>'country')::uuid,null,null,null) then
    raise exception 'TG5_WITHDRAW_FIXTURE_CONTROLLER_NOT_AUTHORIZED';
  end if;

  v_submit := public.world_submit_guard_membership_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    'TG5 Fixture Republic','Parliamentary republic',
    'We are applying for GUARD membership for this bounded rehearsal.',
    'We can offer approved logistics and technical support to GUARD.',
    'We undertake to follow the international obligations of GUARD.',
    gen_random_uuid(),'tg5-intake:' || gen_random_uuid()::text
  );
  if v_submit->>'status' <> 'succeeded'
     or v_submit#>>'{result,status}' <> 'submitted' then
    raise exception 'TG5_WITHDRAW_INTAKE_RECEIPT_INVALID: %',v_submit;
  end if;
  v_application := (v_submit#>>'{result,applicationId}')::uuid;
  perform set_config('solaris.tg5_application_id',v_application::text,true);

  begin
    perform public.world_withdraw_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      v_application,null,gen_random_uuid(),
      'tg5-no-cas:' || gen_random_uuid()::text);
    raise exception 'TG5_WITHDRAW_ACCEPTED_MISSING_CAS';
  exception when sqlstate '22023' then
    if sqlerrm <> 'VALIDATION' then raise; end if;
  end;

  v_response := public.world_withdraw_guard_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    v_application,1,v_operation,v_key);
  if v_response->>'status' <> 'succeeded'
     or v_response#>>'{result,status}' <> 'withdrawn'
     or v_response#>>'{result,revision}' <> '2'
     or v_response->>'replayed' <> 'false' then
    raise exception 'TG5_WITHDRAW_RECEIPT_INVALID: %',v_response;
  end if;
  v_response := public.world_withdraw_guard_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    v_application,1,v_operation,v_key);
  if v_response->>'replayed' <> 'true'
     or v_response#>>'{result,revision}' <> '2' then
    raise exception 'TG5_WITHDRAW_REPLAY_FAILED: %',v_response;
  end if;
  begin
    perform public.world_withdraw_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      v_application,1,gen_random_uuid(),
      'tg5-stale:' || gen_random_uuid()::text);
    raise exception 'TG5_WITHDRAW_ACCEPTED_STALE_REVISION';
  exception when sqlstate '40001' then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;
  raise notice 'PASS: TG5 application submission, withdrawal CAS, exact replay and stale revision';
end
$submit_and_withdraw$;

do $outsider$
declare
  v jsonb := current_setting('solaris.tg5_withdraw_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'other',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'other','role','authenticated')::text,true);
  if auth.uid() is distinct from (v->>'other')::uuid then
    raise exception 'TG5_WITHDRAW_OUTSIDER_SETUP_INVALID';
  end if;
  begin
    perform public.world_withdraw_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      current_setting('solaris.tg5_application_id')::uuid,
      2,gen_random_uuid(),'tg5-forged:' || gen_random_uuid()::text);
    raise exception 'TG5_WITHDRAW_FOREIGN_ACCOUNT_ACCEPTED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'AUTHORIZATION' then raise; end if;
  end;
  raise notice 'PASS: TG5 foreign account denied';
end
$outsider$;
reset role;
set local request.jwt.claim.role='';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

-- Only fixture owner inspects physical history, never an arbitrary user
-- made privileged merely for the sake of the test.
do $owner_history$
declare
  v jsonb := current_setting('solaris.tg5_withdraw_fixture')::jsonb;
begin
  if current_user='authenticated' then
    raise exception 'TG5_WITHDRAW_HISTORY_WRONG_ROLE';
  end if;
  if (select count(*) from public.world_membership_applications
      where id=current_setting('solaris.tg5_application_id')::uuid
        and country_id=(v->>'country')::uuid
        and status='withdrawn' and revision=2) <> 1 then
    raise exception 'TG5_WITHDRAW_PHYSICAL_STATUS_LOST';
  end if;
  if exists (
    select 1 from public.world_organization_memberships
    where organization_id=(v->>'organization')::uuid
      and country_id=(v->>'country')::uuid
  ) then
    raise exception 'TG5_WITHDRAW_PREMATURE_MEMBERSHIP_SIDE_EFFECT';
  end if;
  -- Model a later GAG introduction for a separate synthetic application
  -- inside this disposable transaction, without claiming a reviewer API.
  update public.world_membership_applications
  set status='introduced',revision=3
  where id=current_setting('solaris.tg5_application_id')::uuid;
end
$owner_history$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $introduced$
declare
  v jsonb := current_setting('solaris.tg5_withdraw_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'owner',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'owner','role','authenticated')::text,true);
  begin
    perform public.world_withdraw_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      current_setting('solaris.tg5_application_id')::uuid,
      3,gen_random_uuid(),'tg5-introduced:' || gen_random_uuid()::text);
    raise exception 'TG5_WITHDRAW_ESCAPED_GAG_PROCESS';
  exception when sqlstate '23514' then
    if sqlerrm <> 'APPLICATION_LOCKED' then raise; end if;
  end;
  raise notice 'PASS: TG5 introduced/GAG-governed application cannot be silently withdrawn';
end
$introduced$;
reset role;
rollback;
