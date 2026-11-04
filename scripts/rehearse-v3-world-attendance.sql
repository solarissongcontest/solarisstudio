\set ON_ERROR_STOP on
-- TG6 attendance negative-role and idempotency rehearsal. This script uses
-- only disposable local database objects inside a single rollback transaction.
begin;
do $fixture$
declare
 v_manager uuid := gen_random_uuid();
 v_controller uuid := gen_random_uuid();
 v_outsider uuid := gen_random_uuid();
 v_member_person uuid := gen_random_uuid();
 v_proxy_person uuid := gen_random_uuid();
 v_observer_person uuid := gen_random_uuid();
 v_manager_person uuid := gen_random_uuid();
 v_country uuid := gen_random_uuid();
 v_observer_country uuid := gen_random_uuid();
 v_org uuid := gen_random_uuid();
 v_other_org uuid := gen_random_uuid();
 v_organ uuid := gen_random_uuid();
 v_other_organ uuid := gen_random_uuid();
 v_office uuid := gen_random_uuid();
 v_rep uuid := gen_random_uuid();
 v_other_rep uuid := gen_random_uuid();
 v_observer_rep uuid := gen_random_uuid();
 v_proxy uuid := gen_random_uuid();
 v_foreign_proxy uuid := gen_random_uuid();
 v_session uuid := gen_random_uuid();
begin
 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (v_manager,'authenticated','authenticated',v_manager::text||'@tg6-attendance.invalid',now(),now()),
 (v_controller,'authenticated','authenticated',v_controller::text||'@tg6-attendance.invalid',now(),now()),
 (v_outsider,'authenticated','authenticated',v_outsider::text||'@tg6-attendance.invalid',now(),now());
 insert into public.delegation_people(id,display_name,identity_key) values
 (v_member_person,'TG6 Roll Call Representative','tg6-attendance:'||v_member_person::text),
 (v_proxy_person,'TG6 Roll Call Acting Proxy','tg6-attendance:'||v_proxy_person::text),
 (v_observer_person,'TG6 Nonvoting Observer','tg6-attendance:'||v_observer_person::text),
 (v_manager_person,'TG6 Roll Call Officer','tg6-attendance:'||v_manager_person::text);
 insert into public.countries(id,name,short_code)
 values(v_country,'TG6 Attendance Country','ZZQ'),
       (v_observer_country,'TG6 Attendance Observer','ZZP');
 insert into public.country_accounts(user_id,country_id,status)
 values(v_controller,v_country,'active');
 insert into public.world_organizations
   (id,slug,official_name,short_name,type,status,public_visibility)
 values
 (v_org,'tg6-attendance-'||replace(v_org::text,'-',''),'TG6 Attendance Organization',
  'TG6 Attendance','international_organization','active','public'),
 (v_other_org,'tg6-attendance-'||replace(v_other_org::text,'-',''),
  'TG6 Other Organization','TG6 Other','international_organization','active','public');
 insert into public.world_organization_organs
   (id,organization_id,slug,name,status,visibility)
 values
 (v_organ,v_org,'assembly','TG6 Attendance Assembly','active','public'),
 (v_other_organ,v_other_org,'assembly','TG6 Other Assembly','active','public');
 insert into public.world_organization_memberships(
   organization_id,country_id,membership_type,status)
 values(v_org,v_country,'member','member'),
       (v_org,v_observer_country,'observer','observer');
 insert into public.world_organization_representations(
   id,organization_id,country_id,person_id,user_id,role,voting_authority,source)
 values
 (v_rep,v_org,v_country,v_member_person,v_controller,'representative',true,'tg6_rollback_fixture'),
 (v_other_rep,v_other_org,v_country,v_member_person,v_controller,'representative',true,'tg6_rollback_fixture'),
 (v_observer_rep,v_org,v_observer_country,v_observer_person,null,'representative',false,'tg6_rollback_fixture');
 insert into public.world_organization_offices(
   id,organization_id,slug,title,office_type,appointment_method)
 values(v_office,v_org,'chair','TG6 Roll Call Chair','executive_leader','appointment');
 insert into public.world_office_terms(
   office_id,holder_person_id,holder_user_id,represented_country_id,
   starts_at,term_kind,status)
 values(v_office,v_manager_person,v_manager,v_country,now(),'appointed','active');
 insert into public.world_office_capabilities(office_id,capability)
 values(v_office,'world.session.attendance.manage');
 insert into public.world_sessions(
   id,organization_id,organ_id,title,sequence_number,
   starts_at,ends_at,venue_type,status)
 values(v_session,v_org,v_organ,'TG6 Roll Call Open Session',1,
   now()-interval '1 hour',now()+interval '2 hours','online','open');
 insert into public.world_representation_proxies(
   id,representation_id,proxy_person_id,session_id,
   valid_from,valid_until,status,reason,approved_at,revision)
 values
 (v_proxy,v_rep,v_proxy_person,v_session,
   now()-interval '15 minutes',now()+interval '45 minutes',
   'approved','TG6 local approved proxy',now()-interval '5 minutes',1),
 (v_foreign_proxy,v_other_rep,v_proxy_person,null,
   now()-interval '15 minutes',now()+interval '45 minutes',
   'approved','TG6 foreign organization proxy',now()-interval '5 minutes',1);

 perform set_config('solaris.tg6_attendance_fixture',jsonb_build_object(
  'manager',v_manager,'controller',v_controller,'outsider',v_outsider,
  'sessionId',v_session,'countryId',v_country,
  'representationId',v_rep,'otherRepresentationId',v_other_rep,
  'observerCountryId',v_observer_country,'observerRepresentationId',v_observer_rep,
  'proxyId',v_proxy,'foreignProxyId',v_foreign_proxy,
  'operationId',gen_random_uuid()
 )::text,true);
end
$fixture$;

-- Even privileged direct writes must not bypass session/representation and
-- proxy-identity structural FK-like invariants.
do $direct_identity$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 begin
   insert into public.world_session_attendance
     (session_id,country_id,representation_id,status)
   values((v->>'sessionId')::uuid,(v->>'countryId')::uuid,
          (v->>'otherRepresentationId')::uuid,'present');
   raise exception 'TG6_ATTENDANCE_DIRECT_FOREIGN_REP_BYPASS';
 exception when check_violation then null;
 end;
 begin
   insert into public.world_session_attendance
     (session_id,country_id,representation_id,status,proxy_id)
   values((v->>'sessionId')::uuid,(v->>'countryId')::uuid,
          (v->>'representationId')::uuid,'proxy',(v->>'foreignProxyId')::uuid);
   raise exception 'TG6_ATTENDANCE_DIRECT_FOREIGN_PROXY_BYPASS';
 exception when check_violation then null;
 end;
 raise notice 'PASS: TG6 structural identity trigger rejects privileged foreign links';
end
$direct_identity$;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anon$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'representationId')::uuid,'present',null,null,
     gen_random_uuid(),'tg6-anon:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_ANON_WRITE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end
$anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',jsonb_build_object(
  'sub',v->>'outsider','role','authenticated')::text,true);
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'representationId')::uuid,'present',null,null,
     gen_random_uuid(),'tg6-unauthorized:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_OUTSIDER_WRITE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 if public.world_session_attendance_manage_v1((v->>'sessionId')::uuid) is not null
    or public.world_my_session_attendance_v1(
      (v->>'sessionId')::uuid,(v->>'countryId')::uuid
    ) is not null then
   raise exception 'TG6_ATTENDANCE_OUTSIDER_PRIVATE_READ_ALLOWED';
 end if;
 begin
   perform country_id from public.world_session_attendance;
   raise exception 'TG6_ATTENDANCE_RAW_TABLE_SELECT_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: unauthorized attendee cannot mutate, read private queue, or select raw table';
end
$outsider$;

do $manager$
declare
 v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
 v_operation uuid:=(v->>'operationId')::uuid;
 v_receipt jsonb;
 v_replay jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object(
  'sub',v->>'manager','role','authenticated')::text,true);
 if coalesce(jsonb_array_length(
   public.world_session_attendance_manage_v1((v->>'sessionId')::uuid)->'countries'
 ),0) <> 2 then
   raise exception 'TG6_ATTENDANCE_MANAGER_QUEUE_INCOMPLETE';
 end if;
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'otherRepresentationId')::uuid,'present',null,null,
     gen_random_uuid(),'tg6-cross-org:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_CROSS_ORG_REP_ALLOWED';
 exception when check_violation then null;
 end;
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'representationId')::uuid,'proxy',null,null,
     gen_random_uuid(),'tg6-no-proxy:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_PROXY_WITHOUT_ID_ALLOWED';
 exception when invalid_parameter_value then null;
 end;
 v_receipt:=public.world_record_session_attendance_v1(
   (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
   (v->>'representationId')::uuid,'present',null,null,
   v_operation,'tg6-attendance:'||v_operation::text
 );
 if v_receipt->>'status'<>'succeeded'
    or v_receipt #>> '{result,status}'<>'present'
    or v_receipt #>> '{result,revision}'<>'1' then
   raise exception 'TG6_ATTENDANCE_INITIAL_RECEIPT_INVALID';
 end if;
 v_replay:=public.world_record_session_attendance_v1(
   (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
   (v->>'representationId')::uuid,'present',null,null,
   v_operation,'tg6-attendance:'||v_operation::text
 );
 if coalesce((v_replay->>'replayed')::boolean,false) is not true
    or v_replay #>> '{result,revision}'<>'1' then
   raise exception 'TG6_ATTENDANCE_RECEIPT_REPLAY_UNSTABLE';
 end if;
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'representationId')::uuid,'absent',null,null,
     gen_random_uuid(),'tg6-stale:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_MISSING_CAS_ALLOWED';
 exception when serialization_failure then null;
 end;
 v_receipt:=public.world_record_session_attendance_v1(
   (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
   (v->>'representationId')::uuid,'proxy',(v->>'proxyId')::uuid,1,
   gen_random_uuid(),'tg6-acting:'||gen_random_uuid()::text
 );
 if v_receipt #>> '{result,status}' <> 'proxy'
    or v_receipt #>> '{result,revision}' <> '2' then
   raise exception 'TG6_ATTENDANCE_PROXY_RECEIPT_INVALID';
 end if;
 if not exists (
   select 1 from jsonb_array_elements(
     public.world_session_attendance_manage_v1((v->>'sessionId')::uuid)->'countries'
   ) attendance_country
   where attendance_country->'attendance'->>'status'='proxy'
     and attendance_country->'attendance'->>'revision'='2'
 ) then
   raise exception 'TG6_ATTENDANCE_PROXY_MANAGER_PROJECTION_MISSING';
 end if;
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'observerCountryId')::uuid,
     (v->>'observerRepresentationId')::uuid,'proxy',(v->>'proxyId')::uuid,null,
     gen_random_uuid(),'tg6-observer-proxy:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_OBSERVER_PROXY_ALLOWED';
 exception when check_violation then null;
 end;
 v_receipt:=public.world_record_session_attendance_v1(
   (v->>'sessionId')::uuid,(v->>'observerCountryId')::uuid,
   (v->>'observerRepresentationId')::uuid,'present',null,null,
   gen_random_uuid(),'tg6-observer-present:'||gen_random_uuid()::text
 );
 if v_receipt #>> '{result,status}' <> 'present'
    or v_receipt #>> '{result,revision}' <> '1' then
   raise exception 'TG6_ATTENDANCE_OBSERVER_PRESENT_DENIED';
 end if;
 raise notice 'PASS: TG6 manager roll call CAS, replay, member proxy and nonvoting observer presence';
end
$manager$;
reset role;

do $revoked$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 update public.world_representation_proxies
 set status='revoked',revoked_at=now(),revision=revision+1
 where id=(v->>'proxyId')::uuid;
end
$revoked$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $no_revoked_proxy$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object(
  'sub',v->>'manager','role','authenticated')::text,true);
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'representationId')::uuid,'proxy',(v->>'proxyId')::uuid,2,
     gen_random_uuid(),'tg6-revoked:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_REVOKED_PROXY_REUSED';
 exception when check_violation then null;
 end;
end
$no_revoked_proxy$;

do $absent$
declare
 v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
 v_receipt jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object(
  'sub',v->>'manager','role','authenticated')::text,true);
 v_receipt:=public.world_record_session_attendance_v1(
   (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
   (v->>'representationId')::uuid,'absent',null,2,
   gen_random_uuid(),'tg6-absent:'||gen_random_uuid()::text
 );
 if v_receipt #>> '{result,status}' <> 'absent'
   or v_receipt #>> '{result,revision}' <> '3' then
   raise exception 'TG6_ATTENDANCE_ABSENT_REVISION_INCORRECT';
 end if;
end
$absent$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $controller$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'controller',true);
 perform set_config('request.jwt.claims',jsonb_build_object(
   'sub',v->>'controller','role','authenticated')::text,true);
 if public.world_my_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid
   )->>'status' <> 'absent' then
   raise exception 'TG6_ATTENDANCE_CONTROLLER_OWN_READ_LOST';
 end if;
 if public.world_session_attendance_manage_v1((v->>'sessionId')::uuid) is not null then
   raise exception 'TG6_ATTENDANCE_CONTROLLER_MANAGE_LEAK';
 end if;
end
$controller$;
reset role;


-- Closing a meeting must block NEW roll-call actions, while allowing the
-- exact receipt of an already successful attendance action to be recovered.
-- This is not a new session transition; only a rollback-only fixture update.
do $close_fixture$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 update public.world_sessions set status='concluded'
 where id=(v->>'sessionId')::uuid;
end
$close_fixture$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $closed_replay$
declare
 v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
 v_op uuid:=(v->>'operationId')::uuid;
 v_replayed jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object(
  'sub',v->>'manager','role','authenticated')::text,true);
 v_replayed:=public.world_record_session_attendance_v1(
   (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
   (v->>'representationId')::uuid,'present',null,null,
   v_op,'tg6-attendance:'||v_op::text
 );
 if v_replayed->>'status'<>'succeeded'
   or coalesce((v_replayed->>'replayed')::boolean,false) is not true
   or v_replayed #>> '{result,revision}' <> '1' then
   raise exception 'TG6_ATTENDANCE_CLOSED_RECEIPT_REPLAY_LOST';
 end if;
 begin
   perform public.world_record_session_attendance_v1(
     (v->>'sessionId')::uuid,(v->>'countryId')::uuid,
     (v->>'representationId')::uuid,'present',null,3,
     gen_random_uuid(),'tg6-closed-write:'||gen_random_uuid()::text
   );
   raise exception 'TG6_ATTENDANCE_CLOSED_SESSION_WRITE_ALLOWED';
 exception when check_violation then null;
 end;
 raise notice 'PASS: TG6 closed-session operation receipt replays but no new attendance writes';
end
$closed_replay$;
reset role;

rollback;
do $rollback$
begin
 if exists (select 1 from auth.users where email like '%@tg6-attendance.invalid')
    or exists (select 1 from public.world_organizations
      where slug like 'tg6-attendance-%') then
   raise exception 'TG6_ATTENDANCE_FIXTURES_PERSISTED';
 end if;
 raise notice 'PASS: TG6 attendance fixture rolled back; no production data affected';
end
$rollback$;
