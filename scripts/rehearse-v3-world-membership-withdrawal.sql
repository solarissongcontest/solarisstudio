-- TG5C rollback-only PostgreSQL rehearsal. Run through LOCAL-ONLY shell wrapper.
-- Any unavailable local stack must fail closed. Never use hosted Supabase.
\set ON_ERROR_STOP on
begin;

do $seed$
declare
  v_country uuid := gen_random_uuid();
  v_controller uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_guard uuid;
  v_unity uuid;
  v_guard_member uuid := gen_random_uuid();
  v_unity_member uuid := gen_random_uuid();
  v_rep uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_proxy_person uuid := gen_random_uuid();
  v_office uuid := gen_random_uuid();
  v_officer uuid := gen_random_uuid();
begin
  select id into strict v_guard from public.world_organizations where slug='guard';
  select id into strict v_unity from public.world_organizations where slug='unity';
  if to_regprocedure('public.world_withdraw_membership_v1(uuid,uuid,uuid,bigint,uuid,text)') is null
     or to_regprocedure('public.world_my_membership_withdrawal_v1(uuid)') is null then
    raise exception 'TG5_WITHDRAWAL_FUNCTION_MISSING';
  end if;
  if has_function_privilege('anon','public.world_withdraw_membership_v1(uuid,uuid,uuid,bigint,uuid,text)','EXECUTE')
     or has_function_privilege('anon','public.world_my_membership_withdrawal_v1(uuid)','EXECUTE') then
    raise exception 'TG5_WITHDRAWAL_ANONYMOUS_RPC_EXPOSED';
  end if;

  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_controller,'authenticated','authenticated',v_controller::text||'@tg5-withdrawal.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text||'@tg5-withdrawal.invalid',now(),now());
  insert into public.countries(id,name,short_code)
  values(v_country,'TG5 Withdrawal Test Country','TWZ');
  insert into public.country_accounts(user_id,country_id,status)
  values(v_controller,v_country,'active');
  insert into public.delegation_people(id,display_name,identity_key)
  values
    (v_person,'TG5 Test Representative','tg5-withdrawal:'||v_person::text),
    (v_proxy_person,'TG5 Test Proxy','tg5-withdrawal:'||v_proxy_person::text),
    (v_officer,'TG5 Test Institutional Officer','tg5-withdrawal:'||v_officer::text);

  insert into public.world_organization_memberships(
    id,organization_id,country_id,status,membership_type,joined_at,revision
  ) values
    (v_guard_member,v_guard,v_country,'member','member',now()-interval '3 days',1),
    (v_unity_member,v_unity,v_country,'member','member',now()-interval '3 days',1);

  insert into public.world_organization_representations(
    id,organization_id,country_id,person_id,role,voting_authority,
    starts_at,revision
  ) values (
    v_rep,v_guard,v_country,v_person,'representative',true,
    now()-interval '1 day',1
  );
  insert into public.world_representation_proxies(
    representation_id,proxy_person_id,valid_from,valid_until,status
  ) values (
    v_rep,v_proxy_person,now()-interval '1 hour',
    now()+interval '1 day','approved'
  );
  insert into public.world_organization_offices(
    id,organization_id,slug,title,office_type,appointment_method
  ) values (
    v_office,v_unity,'tg5-withdrawal-'||replace(v_office::text,'-',''),
    'TG5 Test Office','executive_leader','appointment'
  );
  insert into public.world_office_terms(
    office_id,holder_person_id,represented_country_id,started_at,term_kind,status
  ) values (
    v_office,v_officer,v_country,now()-interval '1 day','full','active'
  );

  perform set_config('solaris.tg5_withdrawal_fixture',jsonb_build_object(
    'country',v_country,'controller',v_controller,'outsider',v_outsider,
    'guard',v_guard,'unity',v_unity,
    'guard_member',v_guard_member,'unity_member',v_unity_member,
    'representation',v_rep,'office',v_office
  )::text,true);
end
$seed$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb := current_setting('solaris.tg5_withdrawal_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_my_membership_withdrawal_v1((v->>'country')::uuid);
    raise exception 'TG5_WITHDRAWAL_UNAUTHORIZED_PROJECTION_ALLOWED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'AUTHORIZATION' then raise; end if;
  end;
  begin
    perform public.world_withdraw_membership_v1(
      (v->>'guard')::uuid,(v->>'country')::uuid,
      (v->>'guard_member')::uuid,1,
      gen_random_uuid(),'tg5-withdrawal-outsider:'||gen_random_uuid()::text
    );
    raise exception 'TG5_WITHDRAWAL_UNAUTHORIZED_WRITE_ALLOWED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'AUTHORIZATION' then raise; end if;
  end;
  raise notice 'PASS: outsider denied both private projection and write';
end
$outsider$;

do $controller$
declare
  v jsonb := current_setting('solaris.tg5_withdrawal_fixture')::jsonb;
  v_projection jsonb;
  v_receipt jsonb;
  v_op uuid := gen_random_uuid();
  v_key text := 'tg5-country-withdrawal:'||gen_random_uuid()::text;
begin
  perform set_config('request.jwt.claim.sub',v->>'controller',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'controller','role','authenticated')::text,true);
  v_projection := public.world_my_membership_withdrawal_v1((v->>'country')::uuid);
  if v_projection->>'countryId'<>v->>'country'
    or jsonb_array_length(v_projection->'items')<>2
    or not exists (
      select 1 from jsonb_array_elements(v_projection->'items') row
      where row->>'organizationSlug'='guard' and row->>'canWithdraw'='true'
    )
    or not exists (
      select 1 from jsonb_array_elements(v_projection->'items') row
      where row->>'organizationSlug'='unity'
        and row->>'requiresOfficeTransition'='true'
        and row->>'canWithdraw'='false'
    ) then
    raise exception 'TG5_WITHDRAWAL_PRIVATE_PROJECTION_INVALID: %',v_projection;
  end if;

  begin
    perform public.world_withdraw_membership_v1(
      (v->>'guard')::uuid,(v->>'country')::uuid,
      (v->>'guard_member')::uuid,null,
      gen_random_uuid(),'tg5-withdrawal-no-cas:'||gen_random_uuid()::text
    );
    raise exception 'TG5_WITHDRAWAL_MISSING_CAS_ACCEPTED';
  exception when sqlstate '22023' then
    if sqlerrm <> 'VALIDATION' then raise; end if;
  end;

  v_receipt := public.world_withdraw_membership_v1(
    (v->>'guard')::uuid,(v->>'country')::uuid,
    (v->>'guard_member')::uuid,1,v_op,v_key
  );
  if v_receipt->>'status'<>'succeeded'
    or v_receipt#>>'{result,status}'<>'withdrawn'
    or v_receipt#>>'{result,revision}'<>'2'
    or v_receipt#>>'{result,representationsEnded}'<>'1'
    or v_receipt#>>'{result,proxiesRevoked}'<>'1' then
    raise exception 'TG5_WITHDRAWAL_RECEIPT_INVALID: %',v_receipt;
  end if;
  v_receipt := public.world_withdraw_membership_v1(
    (v->>'guard')::uuid,(v->>'country')::uuid,
    (v->>'guard_member')::uuid,1,v_op,v_key
  );
  if v_receipt->>'replayed'<>'true'
     or v_receipt#>>'{result,revision}'<>'2' then
    raise exception 'TG5_WITHDRAWAL_IDEMPOTENCY_FAILED: %',v_receipt;
  end if;
  begin
    perform public.world_withdraw_membership_v1(
      (v->>'guard')::uuid,(v->>'country')::uuid,
      (v->>'guard_member')::uuid,1,
      gen_random_uuid(),'tg5-withdrawal-stale:'||gen_random_uuid()::text
    );
    raise exception 'TG5_WITHDRAWAL_STALE_REVISION_ALLOWED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  -- A live UNITY officeholder cannot leave through this command without
  -- the canonical acting-succession/election-task consequences.
  begin
    perform public.world_withdraw_membership_v1(
      (v->>'unity')::uuid,(v->>'country')::uuid,
      (v->>'unity_member')::uuid,1,
      gen_random_uuid(),'tg5-withdrawal-office:'||gen_random_uuid()::text
    );
    raise exception 'TG5_WITHDRAWAL_ORPHANED_INSTITUTIONAL_OFFICE';
  exception when sqlstate '23514' then
    if sqlerrm <> 'OFFICE_TRANSITION_REQUIRED' then raise; end if;
  end;
  raise notice 'PASS: country authorization, receipt, CAS, replay and office guard';
end
$controller$;
reset role;

do $assertions$
declare v jsonb := current_setting('solaris.tg5_withdrawal_fixture')::jsonb;
begin
  if not exists (
    select 1 from public.world_organization_memberships m
    where m.id=(v->>'guard_member')::uuid and m.status='withdrawn'
      and m.ended_at is not null and m.revision=2
      and m.termination_reason='voluntary_country_withdrawal'
  ) or exists (
    select 1 from public.world_organization_representations r
    where r.organization_id=(v->>'guard')::uuid
      and r.country_id=(v->>'country')::uuid and r.ends_at is null
  ) or exists (
    select 1 from public.world_representation_proxies p
    join public.world_organization_representations r on r.id=p.representation_id
    where r.organization_id=(v->>'guard')::uuid and r.country_id=(v->>'country')::uuid
      and p.status in ('requested','approved')
  ) or not exists (
    select 1 from public.world_organization_memberships m
    where m.id=(v->>'unity_member')::uuid
      and m.status='member' and m.ended_at is null
  ) then
    raise exception 'TG5_WITHDRAWAL_CANONICAL_RELATIONSHIP_STATE_INVALID';
  end if;
  raise notice 'PASS: GUARD membership and representation closed; UNITY officeholder preserved';
end
$assertions$;

rollback;

do $clean$
begin
  if exists (select 1 from auth.users where email like '%@tg5-withdrawal.invalid')
    or exists (select 1 from public.world_organization_offices where slug like 'tg5-withdrawal-%') then
    raise exception 'TG5_WITHDRAWAL_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: all local test fixtures rolled back';
end
$clean$;