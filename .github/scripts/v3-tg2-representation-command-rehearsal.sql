-- Local disposable Supabase only. Called by the guarded TG2 shell runner.
-- All fixture writes and canonical commands are rolled back.
\set ON_ERROR_STOP on
begin;

do $fixture$
declare
  v_controller uuid := gen_random_uuid();
  v_person_a uuid := gen_random_uuid();
  v_person_b uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values (v_controller,'authenticated','authenticated',
    v_controller::text || '@tg2-representation.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values
    (v_person_a,'TG2 Representative A','tg2-representation:' || v_person_a::text),
    (v_person_b,'TG2 Representative B','tg2-representation:' || v_person_b::text);
  insert into public.countries(id,name,short_code)
  values (v_country,'TG2 Representation Fixture Country','ZXR');
  insert into public.country_accounts(user_id,country_id,status)
  values (v_controller,v_country,'active');
  insert into public.world_organizations
    (id,slug,official_name,short_name,type,status,public_visibility)
  values (v_org,'tg2-representation-' || replace(v_org::text,'-',''),
    'TG2 Representation Fixture','TG2 Fixture','international_organization',
    'active','private');
  insert into public.world_organization_memberships
    (organization_id,country_id,membership_type,status)
  values (v_org,v_country,'member','member');
  perform set_config('solaris.tg2_representation_fixture',jsonb_build_object(
    'controller',v_controller,'country',v_country,'organization',v_org,
    'firstPerson',v_person_a,'secondPerson',v_person_b
  )::text,true);
end
$fixture$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $command$
declare
  v jsonb := current_setting('solaris.tg2_representation_fixture')::jsonb;
  v_org uuid := (v ->> 'organization')::uuid;
  v_country uuid := (v ->> 'country')::uuid;
  v_a uuid := (v ->> 'firstPerson')::uuid;
  v_b uuid := (v ->> 'secondPerson')::uuid;
  v_initial_op uuid := gen_random_uuid();
  v_initial_key text := 'world-tg2-rep-' || gen_random_uuid()::text;
  v_response jsonb;
begin
  perform set_config('request.jwt.claim.sub',v ->> 'controller',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v ->> 'controller','role','authenticated'
  )::text,true);
  if current_user <> 'authenticated'
     or auth.uid() is distinct from (v ->> 'controller')::uuid
     or not public.world_access_allowed(
       'world.representation.manage',v_org,v_country,null,null,null
     ) then
    raise exception 'TG2_REPRESENTATION_AUTHORIZED_CONTROLLER_SETUP_FAILED';
  end if;

  begin
    perform public.world_assign_organization_representative_v1(
      v_org,v_country,v_a,gen_random_uuid(),'tg2-missing-cas-' || gen_random_uuid()::text,null
    );
    raise exception 'TG2_REPRESENTATION_ACCEPTED_BLIND_WRITE';
  exception when sqlstate '22023' then
    if sqlerrm <> 'EXPECTED_REVISION_REQUIRED' then raise; end if;
  end;

  v_response := public.world_assign_organization_representative_v1(
    v_org,v_country,v_a,v_initial_op,v_initial_key,0
  );
  if v_response ->> 'status' <> 'succeeded'
     or v_response #>> '{result,revision}' <> '1'
     or v_response #>> '{result,changed}' <> 'true'
     or v_response ->> 'replayed' <> 'false' then
    raise exception 'TG2_REPRESENTATION_INITIAL_RECEIPT_INVALID: %',v_response;
  end if;
  v_response := public.world_assign_organization_representative_v1(
    v_org,v_country,v_a,v_initial_op,v_initial_key,0
  );
  if v_response ->> 'replayed' <> 'true'
     or v_response #>> '{result,revision}' <> '1' then
    raise exception 'TG2_REPRESENTATION_REPLAY_INVALID: %',v_response;
  end if;

  v_response := public.world_assign_organization_representative_v1(
    v_org,v_country,v_b,gen_random_uuid(),'tg2-replace-' || gen_random_uuid()::text,1
  );
  if v_response #>> '{result,revision}' <> '2'
     or v_response #>> '{result,changed}' <> 'true' then
    raise exception 'TG2_REPRESENTATION_REPLACEMENT_INVALID: %',v_response;
  end if;

  begin
    perform public.world_assign_organization_representative_v1(
      v_org,v_country,v_a,gen_random_uuid(),'tg2-stale-' || gen_random_uuid()::text,1
    );
    raise exception 'TG2_REPRESENTATION_ACCEPTED_STALE_REVISION';
  exception when sqlstate '40001' then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  if (select count(*) from public.world_organization_representations
      where organization_id=v_org and country_id=v_country
        and ends_at is null and role='representative' and voting_authority) <> 1
     or (select count(*) from public.world_organization_representations
      where organization_id=v_org and country_id=v_country) <> 2 then
    raise exception 'TG2_REPRESENTATION_DUPLICATE_OR_MISSING_HISTORY';
  end if;
  raise notice 'PASS: TG2 mandatory CAS, first assignment, exact replay, replacement and stale write';
end
$command$;
reset role;
set local request.jwt.claim.role = '';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';

-- Even if no representative remains current, the durable latest revision must
-- not reset to zero. A suspended member cannot assign a new representative.
do $history$
declare
  v jsonb := current_setting('solaris.tg2_representation_fixture')::jsonb;
begin
  update public.world_organization_representations
  set ends_at = now()
  where organization_id=(v ->> 'organization')::uuid
    and country_id=(v ->> 'country')::uuid and ends_at is null;
end
$history$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $ended$
declare
  v jsonb := current_setting('solaris.tg2_representation_fixture')::jsonb;
  v_org uuid := (v ->> 'organization')::uuid;
  v_country uuid := (v ->> 'country')::uuid;
  v_response jsonb;
begin
  perform set_config('request.jwt.claim.sub',v ->> 'controller',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v ->> 'controller','role','authenticated'
  )::text,true);
  begin
    perform public.world_assign_organization_representative_v1(
      v_org,v_country,(v ->> 'firstPerson')::uuid,gen_random_uuid(),
      'tg2-history-stale-' || gen_random_uuid()::text,0
    );
    raise exception 'TG2_REPRESENTATION_HISTORICAL_REVISION_RESET';
  exception when sqlstate '40001' then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;
  v_response := public.world_assign_organization_representative_v1(
    v_org,v_country,(v ->> 'firstPerson')::uuid,gen_random_uuid(),
    'tg2-history-current-' || gen_random_uuid()::text,2
  );
  if v_response #>> '{result,revision}' <> '3' then
    raise exception 'TG2_REPRESENTATION_HISTORICAL_REVISION_INCORRECT: %',v_response;
  end if;
  raise notice 'PASS: TG2 ended history retains compare-and-swap revision';
end
$ended$;
reset role;
set local request.jwt.claim.role = '';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';

update public.world_organization_memberships
set status='suspended'
where organization_id=(current_setting('solaris.tg2_representation_fixture')::jsonb ->> 'organization')::uuid;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $suspended$
declare
  v jsonb := current_setting('solaris.tg2_representation_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v ->> 'controller',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v ->> 'controller','role','authenticated'
  )::text,true);
  begin
    perform public.world_assign_organization_representative_v1(
      (v ->> 'organization')::uuid,(v ->> 'country')::uuid,
      (v ->> 'secondPerson')::uuid,gen_random_uuid(),
      'tg2-suspended-' || gen_random_uuid()::text,3
    );
    raise exception 'TG2_REPRESENTATION_SUSPENDED_MEMBER_MUTATED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'STATE_CHANGED' then raise; end if;
  end;
  raise notice 'PASS: TG2 suspended membership rejects representative assignment';
end
$suspended$;
reset role;
rollback;
