\set ON_ERROR_STOP on
-- TG6 minutes publication/privacy/idempotency rehearsal. This script uses
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


-- Apply only to the rollback fixture's invented officer; canonical grant
-- assignments in the migration still belong to real institutional offices.
insert into public.world_office_capabilities(office_id,capability)
select office_term.office_id, grant_row.capability
from public.world_office_terms office_term
cross join (values ('world.minutes.manage'),('world.minutes.publish')) grant_row(capability)
where office_term.holder_user_id=
  (current_setting('solaris.tg6_attendance_fixture')::jsonb->>'manager')::uuid
on conflict do nothing;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anonymous$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 if public.world_session_minutes_public_v1((v->>'sessionId')::uuid) is not null
 then raise exception 'TG6_MINUTES_ANON_DRAFT_VISIBLE'; end if;
 begin
   perform session_id from public.world_session_minutes;
   raise exception 'TG6_MINUTES_ANON_RAW_TABLE_READ';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.world_save_session_minutes_v1(
     (v->>'sessionId')::uuid,'Protected','Draft',null,gen_random_uuid(),
     'tg6-anon-minutes:'||gen_random_uuid()::text);
   raise exception 'TG6_MINUTES_ANON_EDIT_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end
$anonymous$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 begin
   perform public.world_session_minutes_manage_v1((v->>'sessionId')::uuid);
   raise exception 'TG6_MINUTES_OUTSIDER_PRIVATE_READ';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.world_submit_session_minutes_v1(
     (v->>'sessionId')::uuid,1,gen_random_uuid(),
     'tg6-outsider-minutes:'||gen_random_uuid()::text);
   raise exception 'TG6_MINUTES_OUTSIDER_REVIEW_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 begin
   perform body from public.world_session_minutes_revisions;
   raise exception 'TG6_MINUTES_OUTSIDER_HISTORY_READ';
 exception when insufficient_privilege then null;
 end;
end
$outsider$;

do $author$
declare
 v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
 v_session uuid:=(v->>'sessionId')::uuid;
 v_op uuid:=gen_random_uuid();
 v_receipt jsonb;
 v_replay jsonb;
 v_submit jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'manager',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
 if public.world_session_minutes_manage_v1(v_session)->>'status'<>'missing'
 then raise exception 'TG6_MINUTES_INITIAL_STATE'; end if;
 v_receipt:=public.world_save_session_minutes_v1(
   v_session,'Session summary','Verified meeting narrative.',null,v_op,
   'tg6-minute-save:'||v_op::text);
 if v_receipt->>'status'<>'succeeded'
    or v_receipt #>> '{result,revision}'<>'1'
 then raise exception 'TG6_MINUTES_DRAFT_RECEIPT'; end if;
 if public.world_session_minutes_public_v1(v_session) is not null
 then raise exception 'TG6_MINUTES_DRAFT_PUBLIC'; end if;
 v_replay:=public.world_save_session_minutes_v1(
   v_session,'Session summary','Verified meeting narrative.',null,v_op,
   'tg6-minute-save:'||v_op::text);
 if coalesce((v_replay->>'replayed')::boolean,false) is not true
    or v_replay #>> '{result,revision}'<>'1'
 then raise exception 'TG6_MINUTES_DRAFT_REPLAY'; end if;
 begin
   perform public.world_save_session_minutes_v1(
     v_session,'Stale','Unverified overwrite',null,gen_random_uuid(),
     'tg6-stale-save:'||gen_random_uuid()::text);
   raise exception 'TG6_MINUTES_STALE_CAS_ALLOWED';
 exception when serialization_failure then null;
 end;
 v_submit:=public.world_submit_session_minutes_v1(
   v_session,1,gen_random_uuid(),'tg6-minute-submit:'||gen_random_uuid()::text);
 if v_submit #>> '{result,status}'<>'in_review'
    or v_submit #>> '{result,revision}'<>'2'
 then raise exception 'TG6_MINUTES_REVIEW_NOT_RECORDED'; end if;
 if public.world_session_minutes_public_v1(v_session) is not null
 then raise exception 'TG6_MINUTES_REVIEW_PUBLIC'; end if;
 begin
   perform public.world_publish_session_minutes_v1(
     v_session,2,gen_random_uuid(),'tg6-too-early:'||gen_random_uuid()::text);
   raise exception 'TG6_MINUTES_EARLY_PUBLICATION_ALLOWED';
 exception when check_violation then null;
 end;
 perform set_config('solaris.tg6_minutes_draft_op',v_op::text,true);
end
$author$;
reset role;

-- Only the fixture administrator can conclude this session. Production
-- callers must use the governed session lifecycle RPC from #1950.
update public.world_sessions set status='concluded'
where id=(current_setting('solaris.tg6_attendance_fixture')::jsonb->>'sessionId')::uuid;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $publish$
declare
 v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
 v_session uuid:=(v->>'sessionId')::uuid;
 v_op uuid:=gen_random_uuid();
 v_pub jsonb;
 v_replay jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'manager',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
 v_pub:=public.world_publish_session_minutes_v1(
   v_session,2,v_op,'tg6-minute-publish:'||v_op::text);
 if v_pub->>'status'<>'succeeded'
   or v_pub #>> '{result,status}'<>'published'
   or v_pub #>> '{result,revision}'<>'3'
 then raise exception 'TG6_MINUTES_PUBLICATION_RECEIPT'; end if;
 if public.world_session_minutes_public_v1(v_session)->>'body'
   <> 'Verified meeting narrative.'
 then raise exception 'TG6_MINUTES_PUBLIC_VIEW_MISMATCH'; end if;
 if public.world_session_minutes_public_v1(v_session) ? 'attendance_snapshot'
    or public.world_session_minutes_public_v1(v_session) ? 'actor_user_id'
 then raise exception 'TG6_MINUTES_PRIVATE_EVIDENCE_LEAK'; end if;
 v_replay:=public.world_publish_session_minutes_v1(
   v_session,2,v_op,'tg6-minute-publish:'||v_op::text);
 if coalesce((v_replay->>'replayed')::boolean,false) is not true
   or v_replay #>> '{result,revision}'<>'3'
 then raise exception 'TG6_MINUTES_PUBLICATION_REPLAY'; end if;
 begin
   perform public.world_save_session_minutes_v1(
     v_session,'Rewrite','Unsafe alteration',3,gen_random_uuid(),
     'tg6-published-edit:'||gen_random_uuid()::text);
   raise exception 'TG6_MINUTES_PUBLISHED_MUTABLE';
 exception when check_violation then null;
 end;
 perform set_config('solaris.tg6_minutes_published_op',v_op::text,true);
end
$publish$;
reset role;

-- Assert privileged direct writes cannot falsify published or past records.
do $immutable$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 begin
   update public.world_session_minutes set body='Tampered'
   where session_id=(v->>'sessionId')::uuid;
   raise exception 'TG6_MINUTES_PRIVILEGED_PUBLISHED_EDIT';
 exception when check_violation then null;
 end;
 begin
   update public.world_session_minutes_revisions set body='Tampered'
   where session_id=(v->>'sessionId')::uuid and revision=1;
   raise exception 'TG6_MINUTES_PRIVILEGED_HISTORY_EDIT';
 exception when check_violation then null;
 end;
 if (select count(*) from public.world_session_minutes_revisions
     where session_id=(v->>'sessionId')::uuid)<>3
 then raise exception 'TG6_MINUTES_APPEND_HISTORY_INCOMPLETE'; end if;
 if (select count(*) from public.world_session_minutes_revisions
     where session_id=(v->>'sessionId')::uuid
       and status='published' and agenda_snapshot is not null
       and attendance_snapshot is not null)<>1
 then raise exception 'TG6_MINUTES_HISTORICAL_SNAPSHOT_MISSING'; end if;
end
$immutable$;

update public.world_sessions set status='archived'
where id=(current_setting('solaris.tg6_attendance_fixture')::jsonb->>'sessionId')::uuid;
set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $published_archive$
declare v jsonb:=current_setting('solaris.tg6_attendance_fixture')::jsonb;
begin
 if public.world_session_minutes_public_v1((v->>'sessionId')::uuid)->>'status'
    <>'published'
 then raise exception 'TG6_MINUTES_PUBLIC_ARCHIVE_MISSING'; end if;
end
$published_archive$;
reset role;

rollback;
do $rollback$
begin
 if exists (select 1 from auth.users where email like '%@tg6-attendance.invalid')
    or exists (select 1 from public.world_organizations
      where slug like 'tg6-attendance-%') then
   raise exception 'TG6_MINUTES_FIXTURE_PERSISTED';
 end if;
 raise notice 'PASS: TG6 minutes permissions, state, history and archive rollback';
end
$rollback$;
