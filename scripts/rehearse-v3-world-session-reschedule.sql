\set ON_ERROR_STOP on
-- ROLLBACK-ONLY TG6 reschedule test. Execute only through loopback guard.
begin;

do $seed$
declare
  v_manager uuid:=gen_random_uuid();
  v_outsider uuid:=gen_random_uuid();
  v_manager_person uuid:=gen_random_uuid();
  v_organization uuid:=gen_random_uuid();
  v_organ uuid:=gen_random_uuid();
  v_office uuid:=gen_random_uuid();
  v_session uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_manager,'authenticated','authenticated',
      v_manager::text||'@tg6-reschedule.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',
      v_outsider::text||'@tg6-reschedule.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values(v_manager_person,'TG6 Schedule Officer',
    'tg6-reschedule:'||v_manager_person::text);
  insert into public.world_organizations(
    id,slug,official_name,short_name,type,status,public_visibility)
  values(v_organization,'tg6-reschedule-'||replace(v_organization::text,'-',''),
    'TG6 Schedule Institution','TG6 Schedule',
    'international_organization','active','public');
  insert into public.world_organization_organs(
    id,organization_id,slug,name,visibility,status)
  values(v_organ,v_organization,'assembly','TG6 Schedule Assembly',
    'public','active');
  insert into public.world_organization_offices(
    id,organization_id,slug,title,office_type,appointment_method)
  values(v_office,v_organization,'chair','TG6 Schedule Chair',
    'executive_leader','appointment');
  insert into public.world_office_terms(
    office_id,holder_person_id,holder_user_id,started_at,term_kind,status)
  values(v_office,v_manager_person,v_manager,now()-interval '1 minute',
    'appointed','active');
  insert into public.world_office_capabilities(office_id,capability)
  values(v_office,'world.session.manage');
  insert into public.world_sessions(
    id,organization_id,organ_id,title,sequence_number,
    starts_at,ends_at,venue_type,status,visibility,revision)
  values(v_session,v_organization,v_organ,'TG6 Future Meeting',1,
    now()+interval '2 days',now()+interval '2 days 1 hour',
    'online','scheduled','public',1);
  perform set_config('solaris.tg6_schedule_fixture',jsonb_build_object(
    'manager',v_manager,'outsider',v_outsider,'sessionId',v_session,
    'startsAt',now()+interval '3 days',
    'endsAt',now()+interval '3 days 90 minutes',
    'operationId',gen_random_uuid()
  )::text,true);
end
$seed$;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anon$
declare v jsonb:=current_setting('solaris.tg6_schedule_fixture')::jsonb;
begin
  begin
    perform public.world_session_schedule_manage_v1((v->>'sessionId')::uuid);
    raise exception 'TG6_SCHEDULE_ANON_PRIVATE_READ_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.world_session_reschedule_v1(
      (v->>'sessionId')::uuid,
      (v->>'startsAt')::timestamptz,(v->>'endsAt')::timestamptz,
      'external','Official group','https://tg6.invalid/private',1,
      gen_random_uuid(),'tg6-anon-reschedule:'||gen_random_uuid()::text);
    raise exception 'TG6_SCHEDULE_ANON_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.tg6_schedule_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_session_schedule_manage_v1((v->>'sessionId')::uuid);
    raise exception 'TG6_SCHEDULE_OUTSIDER_PRIVATE_READ_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.world_session_reschedule_v1(
      (v->>'sessionId')::uuid,
      (v->>'startsAt')::timestamptz,(v->>'endsAt')::timestamptz,
      'external','Official group','https://tg6.invalid/private',1,
      gen_random_uuid(),'tg6-outsider-reschedule:'||gen_random_uuid()::text);
    raise exception 'TG6_SCHEDULE_OUTSIDER_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$outsider$;

do $manager$
declare
  v jsonb:=current_setting('solaris.tg6_schedule_fixture')::jsonb;
  v_op uuid:=(v->>'operationId')::uuid;
  v_receipt jsonb;
  v_replay jsonb;
  v_data jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'manager',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
  v_data:=public.world_session_schedule_manage_v1((v->>'sessionId')::uuid);
  if v_data->>'status'<>'scheduled'
     or v_data->>'revision'<>'1' then
    raise exception 'TG6_SCHEDULE_MANAGER_PRECONDITION_INVALID';
  end if;

  begin
    perform public.world_session_reschedule_v1(
      (v->>'sessionId')::uuid,
      (v->>'startsAt')::timestamptz,(v->>'endsAt')::timestamptz,
      'external','Official group','http://unsafe.invalid',1,
      gen_random_uuid(),'tg6-bad-url:'||gen_random_uuid()::text);
    raise exception 'TG6_SCHEDULE_NON_HTTPS_URL_ALLOWED';
  exception when invalid_parameter_value then null;
  end;

  v_receipt:=public.world_session_reschedule_v1(
    (v->>'sessionId')::uuid,
    (v->>'startsAt')::timestamptz,(v->>'endsAt')::timestamptz,
    'external','Official group','https://tg6.invalid/private',1,
    v_op,'tg6-reschedule:'||v_op::text);
  if v_receipt->>'status'<>'succeeded'
     or v_receipt #>> '{result,revision}'<>'2'
  then raise exception 'TG6_SCHEDULE_RECEIPT_INVALID'; end if;
  v_data:=public.world_session_schedule_manage_v1((v->>'sessionId')::uuid);
  if v_data->>'venueType'<>'external'
     or v_data->>'externalUrl'<>'https://tg6.invalid/private'
     or v_data->>'revision'<>'2'
  then raise exception 'TG6_SCHEDULE_PRIVATE_MANAGE_READ_INCOMPLETE'; end if;
  if public.world_session_detail_v1((v->>'sessionId')::uuid)
     ? 'externalUrl'
     and public.world_session_detail_v1((v->>'sessionId')::uuid)->>'externalUrl' is not null
  then raise exception 'TG6_SCHEDULE_PRIVATE_URL_PUBLIC_LEAK'; end if;

  v_replay:=public.world_session_reschedule_v1(
    (v->>'sessionId')::uuid,
    (v->>'startsAt')::timestamptz,(v->>'endsAt')::timestamptz,
    'external','Official group','https://tg6.invalid/private',1,
    v_op,'tg6-reschedule:'||v_op::text);
  if coalesce((v_replay->>'replayed')::boolean,false) is not true
     or v_replay #>> '{result,revision}'<>'2'
  then raise exception 'TG6_SCHEDULE_REPLAY_UNSTABLE'; end if;

  begin
    perform public.world_session_reschedule_v1(
      (v->>'sessionId')::uuid,
      (v->>'startsAt')::timestamptz+interval '1 hour',
      (v->>'endsAt')::timestamptz+interval '1 hour',
      'online',null,null,1,
      gen_random_uuid(),'tg6-stale-version:'||gen_random_uuid()::text);
    raise exception 'TG6_SCHEDULE_STALE_CAS_ALLOWED';
  exception when serialization_failure then null;
  end;
end
$manager$;
reset role;

-- Only the rollback fixture changes the session state directly. Production
-- follows the existing TG6 governed session lifecycle RPC from #1950.
update public.world_sessions set status='open'
where id=(current_setting('solaris.tg6_schedule_fixture')::jsonb->>'sessionId')::uuid;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $closed$
declare
  v jsonb:=current_setting('solaris.tg6_schedule_fixture')::jsonb;
  v_op uuid:=(v->>'operationId')::uuid;
  v_replay jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'manager',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
  v_replay:=public.world_session_reschedule_v1(
    (v->>'sessionId')::uuid,
    (v->>'startsAt')::timestamptz,(v->>'endsAt')::timestamptz,
    'external','Official group','https://tg6.invalid/private',1,
    v_op,'tg6-reschedule:'||v_op::text);
  if coalesce((v_replay->>'replayed')::boolean,false) is not true
     or v_replay #>> '{result,revision}'<>'2'
  then raise exception 'TG6_SCHEDULE_CLOSED_REPLAY_LOST'; end if;
  begin
    perform public.world_session_reschedule_v1(
      (v->>'sessionId')::uuid,
      (v->>'startsAt')::timestamptz+interval '1 hour',
      (v->>'endsAt')::timestamptz+interval '1 hour',
      'online',null,null,2,
      gen_random_uuid(),'tg6-open-change:'||gen_random_uuid()::text);
    raise exception 'TG6_SCHEDULE_OPEN_SESSION_MUTABLE';
  exception when check_violation then null;
  end;
end
$closed$;
reset role;

rollback;
do $rolled_back$
begin
  if exists (select 1 from auth.users where email like '%@tg6-reschedule.invalid')
     or exists (select 1 from public.world_organizations
                where slug like 'tg6-reschedule-%')
  then raise exception 'TG6_SCHEDULE_FIXTURES_PERSISTED'; end if;
  raise notice 'PASS: TG6 session-reschedule fixture rolled back';
end
$rolled_back$;
