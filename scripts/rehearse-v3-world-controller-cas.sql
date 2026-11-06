-- WORLD-01 TG1 controller-person CAS / effective public identity.
-- Only execute with scripts/rehearse-v3-world-controller-cas.sh against
-- isolated, disposable local Supabase. All fixtures and operations rollback.
\set ON_ERROR_STOP on
begin;

do $fixture$
declare
  v_user uuid := gen_random_uuid();
  v_person_old uuid := gen_random_uuid();
  v_person_new uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values (v_user,'authenticated','authenticated',
    v_user::text || '@tg1-controller-cas.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values
    (v_person_old,'TG1 Controller CAS Old','tg1-cas:' || v_person_old::text),
    (v_person_new,'TG1 Controller CAS New','tg1-cas:' || v_person_new::text);
  insert into public.countries(id,name,short_code)
  values (v_country,'TG1 Controller CAS Fixture Country','ZXC');
  insert into public.country_accounts(user_id,country_id,status)
  values (v_user,v_country,'active');
  insert into public.studio2_capability_grants(user_id,capability,edition_id)
  values (v_user,'delegation.manage',null);
  -- Deliberately future-dated open history. It must not be presented as
  -- the current controller until the start time is effective.
  insert into public.world_country_control_terms(
    country_id,person_id,user_id,started_at,source,revision
  ) values (v_country,v_person_old,v_user,now()+interval '1 day','tg1_cas_rehearsal',1);
  perform set_config('solaris.tg1_controller_cas_fixture',jsonb_build_object(
    'user',v_user,'country',v_country,'oldPerson',v_person_old,'newPerson',v_person_new
  )::text,true);
end
$fixture$;

-- Anonymous consumers must see the country, but no future political owner.
set local role anon;
do $future$
declare
  v jsonb := current_setting('solaris.tg1_controller_cas_fixture')::jsonb;
  v_person uuid;
begin
  select controller_person_id into v_person
  from public.world_country_identity_v1((v->>'country')::uuid);
  if v_person is not null then
    raise exception 'TG1_CAS_FUTURE_CONTROLLER_LEAK';
  end if;
  raise notice 'PASS: future historical controller is not published as current';
end $future$;
reset role;

update public.world_country_control_terms
set started_at=now()-interval '1 day'
where country_id=(current_setting('solaris.tg1_controller_cas_fixture')::jsonb->>'country')::uuid;

set local role anon;
do $effective$
declare
  v jsonb := current_setting('solaris.tg1_controller_cas_fixture')::jsonb;
  v_person uuid;
begin
  select controller_person_id into v_person
  from public.world_country_identity_v1((v->>'country')::uuid);
  if v_person is distinct from (v->>'oldPerson')::uuid then
    raise exception 'TG1_CAS_CURRENT_CONTROLLER_NOT_PUBLISHED';
  end if;
  raise notice 'PASS: effective owner is safely published';
end $effective$;
reset role;

-- Use ordinary authenticated command authority, NOT a service-role
-- short-circuit. This also confirms the existing grant/capability engine.
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $command$
declare
  v jsonb := current_setting('solaris.tg1_controller_cas_fixture')::jsonb;
  v_country uuid := (v->>'country')::uuid;
  v_user uuid := (v->>'user')::uuid;
  v_person uuid := (v->>'newPerson')::uuid;
  v_operation uuid := gen_random_uuid();
  v_key text := 'tg1-controller-cas-' || gen_random_uuid()::text;
  v_response jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'user',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'user','role','authenticated'
  )::text,true);
  if auth.uid() is distinct from v_user or
     not public.studio2_access_allowed('delegation.manage',null,false) then
    raise exception 'TG1_CAS_AUTHENTICATED_CAPABILITY_SETUP_FAILED';
  end if;

  begin
    perform public.world_bind_country_controller_person_v1(
      v_country,v_person,'TG1 missing expected actor',
      gen_random_uuid(),'tg1-no-cas-' || gen_random_uuid()::text,null
    );
    raise exception 'TG1_CAS_ACCEPTED_BLIND_REBIND';
  exception when sqlstate '22023' then
    if sqlerrm <> 'EXPECTED_CONTROLLER_REQUIRED' then raise; end if;
  end;

  begin
    perform public.world_bind_country_controller_person_v1(
      v_country,v_person,'TG1 stale expected actor',
      gen_random_uuid(),'tg1-stale-' || gen_random_uuid()::text,gen_random_uuid()
    );
    raise exception 'TG1_CAS_ACCEPTED_STALE_ACTOR';
  exception when sqlstate '40001' then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  v_response := public.world_bind_country_controller_person_v1(
    v_country,v_person,'TG1 explicit corrected durable person binding',
    v_operation,v_key,v_user
  );
  if v_response->>'status' <> 'succeeded'
     or v_response#>>'{result,changed}' <> 'true'
     or v_response#>>'{result,revision}' <> '2'
     or v_response->>'replayed' <> 'false' then
    raise exception 'TG1_CAS_SUCCESS_RECEIPT_INVALID: %',v_response;
  end if;

  v_response := public.world_bind_country_controller_person_v1(
    v_country,v_person,'TG1 explicit corrected durable person binding',
    v_operation,v_key,v_user
  );
  if v_response->>'replayed' <> 'true'
     or v_response#>>'{result,revision}' <> '2' then
    raise exception 'TG1_CAS_IDEMPOTENT_REPLAY_INVALID: %',v_response;
  end if;
  raise notice 'PASS: authenticated CAS rejects missing/stale actor, binds expected actor, replays receipt';
end $command$;
reset role;
set local request.jwt.claim.role='';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{}';

do $history$
declare
  v jsonb := current_setting('solaris.tg1_controller_cas_fixture')::jsonb;
  v_country uuid := (v->>'country')::uuid;
  v_controller uuid;
  v_person uuid;
begin
  if (select count(*) from public.world_country_control_terms where country_id=v_country) <> 2
     or (select count(*) from public.world_country_control_terms
         where country_id=v_country and ended_at is null) <> 1
     or (select max(revision) from public.world_country_control_terms
         where country_id=v_country) <> 2 then
    raise exception 'TG1_CAS_HISTORY_INCONSISTENT';
  end if;
  select ca.user_id into v_controller from public.country_accounts ca
  where ca.country_id=v_country and ca.status='active';
  if v_controller is distinct from (v->>'user')::uuid then
    raise exception 'TG1_CAS_CHANGED_CANONICAL_COUNTRY_OWNER';
  end if;
  select controller_person_id into v_person
    from public.world_country_identity_v1(v_country);
  if v_person is distinct from (v->>'newPerson')::uuid then
    raise exception 'TG1_CAS_EFFECTIVE_HISTORY_PROJECTION_STALE';
  end if;
  raise notice 'PASS: one authoritative account, immutable historical lineage and updated public identity';
end $history$;

rollback;

do $cleanup$
begin
  if exists(select 1 from auth.users where email like '%@tg1-controller-cas.invalid')
     or exists(select 1 from public.countries where short_code='ZXC') then
    raise exception 'TG1_CAS_LOCAL_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: TG1 fixture rollback';
end $cleanup$;
