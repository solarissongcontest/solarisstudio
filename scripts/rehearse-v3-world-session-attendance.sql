\set ON_ERROR_STOP on
-- TG6 S6 attendance: disposable local Supabase only, always rolled back.
begin;

do $seed$
declare
  v_manager uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_manager_person uuid := gen_random_uuid();
  v_rep_person uuid := gen_random_uuid();
  v_proxy_person uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_organ uuid := gen_random_uuid();
  v_other_organ uuid := gen_random_uuid();
  v_office uuid := gen_random_uuid();
  v_rep uuid := gen_random_uuid();
  v_other_rep uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_proxy uuid := gen_random_uuid();
  v_pending_proxy uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_manager,'authenticated','authenticated',v_manager::text || '@tg6-attendance.invalid',now(),now()),
    (v_owner,'authenticated','authenticated',v_owner::text || '@tg6-attendance.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text || '@tg6-attendance.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values
    (v_manager_person,'TG6 Attendance Manager','tg6-attendance:' || v_manager_person::text),
    (v_rep_person,'TG6 Attendance Representative','tg6-attendance:' || v_rep_person::text),
    (v_proxy_person,'TG6 Attendance Proxy','tg6-attendance:' || v_proxy_person::text);
  insert into public.countries(id,name,short_code)
  values(v_country,'TG6 Attendance Country','ZZA');
  insert into public.country_accounts(user_id,country_id,status)
  values(v_owner,v_country,'active');

  insert into public.world_organizations
    (id,slug,official_name,short_name,type,status,public_visibility)
  values
    (v_org,'tg6-attendance-' || replace(v_org::text,'-',''),
      'TG6 Attendance Institution','TG6 Attendance','international_organization','active','public'),
    (v_other_org,'tg6-attendance-' || replace(v_other_org::text,'-',''),
      'Foreign TG6 Institution','Foreign TG6','international_organization','active','public');
  insert into public.world_organization_organs
    (id,organization_id,slug,name,visibility,status)
  values
    (v_organ,v_org,'assembly','Attendance Assembly','public','active'),
    (v_other_organ,v_other_org,'assembly','Foreign Assembly','public','active');
  insert into public.world_organization_memberships
    (organization_id,country_id,membership_type,status)
  values
    (v_org,v_country,'member','member'),
    (v_other_org,v_country,'member','member');
  insert into public.world_organization_representations
    (id,organization_id,country_id,person_id,user_id,role,voting_authority,source)
  values
    (v_rep,v_org,v_country,v_rep_person,v_owner,'representative',true,'tg6_attendance_fixture'),
    (v_other_rep,v_other_org,v_country,v_rep_person,v_owner,'representative',true,'tg6_attendance_fixture');
  insert into public.world_organization_offices
    (id,organization_id,organ_id,slug,title,office_type,appointment_method)
  values
    (v_office,v_org,v_organ,'attendance-manager',
      'TG6 Attendance Manager','executive_leader','appointment');
  insert into public.world_office_terms
    (office_id,holder_person_id,holder_user_id,represented_country_id,started_at,term_kind,status)
  values(v_office,v_manager_person,v_manager,v_country,now(),'appointed','active');
  insert into public.world_office_capabilities(office_id,capability)
  values(v_office,'world.session.attendance.manage');

  insert into public.world_sessions
    (id,organization_id,organ_id,title,sequence_number,starts_at,ends_at,venue_type,status)
  values
    (v_session,v_org,v_organ,'TG6 Attendance Fixture Meeting',
     1,now()-interval '30 minutes',now()+interval '90 minutes','online','open');
  insert into public.world_representation_proxies
    (id,representation_id,proxy_person_id,session_id,valid_from,valid_until,reason,status,approved_at)
  values
    (v_proxy,v_rep,v_proxy_person,v_session,
      now()-interval '15 minutes',now()+interval '60 minutes',
      'Approved acting proxy for roll call','approved',now()-interval '20 minutes'),
    (v_pending_proxy,v_rep,v_proxy_person,v_session,
      now()-interval '15 minutes',now()+interval '60 minutes',
      'Pending, not an approved acting proxy','requested',null);

  perform set_config('solaris.tg6_attendance_fixture',jsonb_build_object(
    'manager',v_manager,'owner',v_owner,'outsider',v_outsider,
    'sessionId',v_session,'countryId',v_country,
    'representationId',v_rep,'foreignRepresentationId',v_other_rep,
    'approvedProxyId',v_proxy,'pendingProxyId',v_pending_proxy,
    'operationId',gen_random_uuid()
  )::text,true);
end
$seed$;

set local role anon;
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
do $anon$
declare
  v jsonb := current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'representationId')::uuid,'present',null,null,
      gen_random_uuid(),'tg6-attendance-anon:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_ANONYMOUS_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.world_session_attendance_manage_v1((v->>'sessionId')::uuid);
    raise exception 'TG6_ATTENDANCE_ANONYMOUS_MANAGER_READ_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $outsider$
declare
  v jsonb := current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  if public.world_session_attendance_manage_v1((v->>'sessionId')::uuid) is not null then
    raise exception 'TG6_ATTENDANCE_UNAUTHORIZED_MANAGER_PROJECTION';
  end if;
  if public.world_my_session_attendance_v1(
    (v->>'sessionId')::uuid,(v->>'countryId')::uuid
  ) is not null then
    raise exception 'TG6_ATTENDANCE_UNAUTHORIZED_COUNTRY_READ';
  end if;
  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'representationId')::uuid,'present',null,null,
      gen_random_uuid(),'tg6-attendance-outsider:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_UNRELATED_COUNTRY_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.world_session_attendance;
    raise exception 'TG6_ATTENDANCE_DIRECT_SELECT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$outsider$;

do $manager$
declare
  v jsonb := current_setting('solaris.tg6_attendance_fixture')::jsonb;
  v_first jsonb;
  v_replay jsonb;
  v_second jsonb;
  v_item jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'manager',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
  if not exists (
    select 1 from jsonb_array_elements(
      public.world_session_attendance_manage_v1((v->>'sessionId')::uuid)->'countries'
    ) country
    where country->>'countryId'=v->>'countryId'
      and country->>'representationId'=v->>'representationId'
      and jsonb_array_length(country->'proxies')=1
  ) then
    raise exception 'TG6_ATTENDANCE_MANAGER_PROJECTION_MISSING';
  end if;
  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'foreignRepresentationId')::uuid,'present',null,null,
      gen_random_uuid(),'tg6-attendance-cross-org:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_FOREIGN_REPRESENTATION_ALLOWED';
  exception when check_violation then null;
  end;
  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'representationId')::uuid,'proxy',(v->>'pendingProxyId')::uuid,null,
      gen_random_uuid(),'tg6-attendance-pending-proxy:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_PENDING_PROXY_ACCEPTED';
  exception when check_violation then null;
  end;
  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'representationId')::uuid,'present',(v->>'approvedProxyId')::uuid,null,
      gen_random_uuid(),'tg6-attendance-incorrect-pair:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_PROXY_STATUS_PAIR_BYPASS';
  exception when invalid_parameter_value then null;
  end;

  v_first := public.world_record_session_attendance_v1(
    (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
    (v->>'representationId')::uuid,'proxy',(v->>'approvedProxyId')::uuid,null,
    (v->>'operationId')::uuid,'tg6-attendance:' || (v->>'operationId')
  );
  if v_first->>'status' <> 'succeeded'
     or v_first #>> '{result,status}' <> 'proxy'
     or v_first #>> '{result,revision}' <> '1'
  then raise exception 'TG6_ATTENDANCE_FIRST_RECEIPT_INVALID'; end if;

  v_replay := public.world_record_session_attendance_v1(
    (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
    (v->>'representationId')::uuid,'proxy',(v->>'approvedProxyId')::uuid,null,
    (v->>'operationId')::uuid,'tg6-attendance:' || (v->>'operationId')
  );
  if coalesce((v_replay->>'replayed')::boolean,false) is not true
     or v_replay #>> '{result,revision}' <> '1'
  then raise exception 'TG6_ATTENDANCE_RECEIPT_REPLAY_UNSTABLE'; end if;

  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'representationId')::uuid,'absent',null,null,
      gen_random_uuid(),'tg6-attendance-stale:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_STALE_REVISION_ALLOWED';
  exception when serialization_failure then null;
  end;

  v_second := public.world_record_session_attendance_v1(
    (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
    (v->>'representationId')::uuid,'present',null,1,
    gen_random_uuid(),'tg6-attendance-update:' || gen_random_uuid()::text
  );
  if v_second #>> '{result,status}' <> 'present'
     or v_second #>> '{result,revision}' <> '2'
  then raise exception 'TG6_ATTENDANCE_REVISION_INCREMENT_INVALID'; end if;

  v_item := public.world_session_attendance_manage_v1((v->>'sessionId')::uuid);
  if not exists (
    select 1 from jsonb_array_elements(v_item->'countries') country
    where country->>'countryId'=v->>'countryId'
      and country #>> '{attendance,status}'='present'
      and country #>> '{attendance,revision}'='2'
  ) then raise exception 'TG6_ATTENDANCE_MANAGER_RECONCILIATION_INVALID'; end if;
end
$manager$;

do $owner$
declare
  v jsonb := current_setting('solaris.tg6_attendance_fixture')::jsonb;
  v_item jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'owner',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'owner','role','authenticated')::text,true);
  v_item := public.world_my_session_attendance_v1(
    (v->>'sessionId')::uuid,(v->>'countryId')::uuid);
  if v_item->>'countryId' <> v->>'countryId'
     or v_item->>'status' <> 'present'
     or v_item->>'revision' <> '2'
  then raise exception 'TG6_ATTENDANCE_COUNTRY_SELF_PROJECTION_MISSING'; end if;
end
$owner$;
reset role;

-- After the meeting ends, new writes must fail even though previous receipts
-- remain reconstructable by their original exact operation identity.
do $closed_seed$
declare v jsonb := current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
  update public.world_sessions set status='concluded'
    where id=(v->>'sessionId')::uuid;
end
$closed_seed$;
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $closed$
declare
  v jsonb := current_setting('solaris.tg6_attendance_fixture')::jsonb;
  v_receipt jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'manager',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
  v_receipt := public.world_record_session_attendance_v1(
    (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
    (v->>'representationId')::uuid,'proxy',(v->>'approvedProxyId')::uuid,null,
    (v->>'operationId')::uuid,'tg6-attendance:' || (v->>'operationId')
  );
  if v_receipt #>> '{result,revision}' <> '1'
     or coalesce((v_receipt->>'replayed')::boolean,false) is not true
  then raise exception 'TG6_ATTENDANCE_CLOSED_RECEIPT_REPLAY_LOST'; end if;

  begin
    perform public.world_record_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
      (v->>'representationId')::uuid,'absent',null,2,
      gen_random_uuid(),'tg6-attendance-closed:' || gen_random_uuid()::text
    );
    raise exception 'TG6_ATTENDANCE_CLOSED_SESSION_WRITE_ALLOWED';
  exception when check_violation then null;
  end;
end
$closed$;
reset role;
rollback;

do $rolled_back$
begin
  if exists (select 1 from auth.users where email like '%@tg6-attendance.invalid')
     or exists (select 1 from public.world_organizations where slug like 'tg6-attendance-%')
  then
    raise exception 'TG6_ATTENDANCE_TEST_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: TG6 attendance authorization, CAS, replay, proxy effectiveness, history and rollback';
end
$rolled_back$;
