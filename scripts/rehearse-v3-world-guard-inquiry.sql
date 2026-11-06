\set ON_ERROR_STOP on
-- WORLD-08 GUARD formal inquiry rehearsal. Required: clean disposable local
-- Supabase with TG2 + TG13 migrations applied, never hosted production.
begin;
do $seed$
declare
 v_chair uuid:=gen_random_uuid();
 v_target_user uuid:=gen_random_uuid();
 v_outsider uuid:=gen_random_uuid();
 v_target_country uuid:=gen_random_uuid();
 v_chair_person uuid:=gen_random_uuid();
 v_guard uuid;v_office uuid;
begin
 select id into v_guard from public.world_organizations where slug='guard';
 if v_guard is null then raise exception 'GUARD_LOCAL_FOUNDATION_NOT_MIGRATED'; end if;
 select office.id into v_office
 from public.world_organization_offices office
 where office.organization_id=v_guard and office.slug='chairperson';
 if v_office is null then raise exception 'GUARD_CHAIR_OFFICE_MISSING'; end if;
 if exists(select 1 from public.world_office_terms term
  where term.office_id=v_office and term.status='active' and term.actual_end_at is null)
 then raise exception 'GUARD_LOCAL_REHEARSAL_REQUIRES_EMPTY_CHAIR_OFFICE'; end if;

 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (v_chair,'authenticated','authenticated',v_chair::text||'@guard-inquiry.invalid',now(),now()),
 (v_target_user,'authenticated','authenticated',v_target_user::text||'@guard-inquiry.invalid',now(),now()),
 (v_outsider,'authenticated','authenticated',v_outsider::text||'@guard-inquiry.invalid',now(),now());
 insert into public.countries(id,name,short_code)
 values(v_target_country,'GUARD Local Inquiry Test Country','ZQJ');
 insert into public.country_accounts(user_id,country_id,status)
 values(v_target_user,v_target_country,'active');
 insert into public.delegation_people(id,display_name,identity_key)
 values(v_chair_person,'GUARD Local Chair','guard-inquiry:'||v_chair_person::text);
 insert into public.world_office_terms(
  office_id,holder_person_id,holder_user_id,started_at,term_kind,status
 ) values(v_office,v_chair_person,v_chair,
  now()-interval '1 day','full','active');
 perform set_config('solaris.guard_inquiry_fixture',jsonb_build_object(
  'chair',v_chair,'targetUser',v_target_user,'outsider',v_outsider,
  'targetCountry',v_target_country,'guardOrg',v_guard
 )::text,true);
end $seed$;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anon$
begin
 begin
  perform id from public.world_guard_inquiries;
  raise exception 'GUARD_ANON_PRIVATE_RAW_READ_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 begin
  perform id from public.world_guard_inquiry_reviews;
  raise exception 'GUARD_ANON_PRIVATE_REVIEW_READ_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.guard_inquiry_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 if public.world_guard_inquiry_can_open_v1((v->>'guardOrg')::uuid)
  or public.world_guard_inquiry_can_review_v1((v->>'guardOrg')::uuid)
 then raise exception 'GUARD_OUTSIDER_CLAIMS_CHAIR_AUTHORITY'; end if;
 begin
  perform public.world_open_guard_inquiry_v1(
   (v->>'guardOrg')::uuid,(v->>'targetCountry')::uuid,
   'An unauthorized outside user attempted to open a formal inquiry.',
   'GUARD Charter Article 1',now()+interval '1 day',
   gen_random_uuid(),'guard-outsider-'||gen_random_uuid()::text
  );
  raise exception 'GUARD_OUTSIDER_INQUIRY_OPEN_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $outsider$;

do $chair_open$
declare
 v jsonb:=current_setting('solaris.guard_inquiry_fixture')::jsonb;
 op uuid:=gen_random_uuid();
 due timestamptz:=now()+interval '1 day';
 result jsonb;replay jsonb;inquiry uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'chair',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
 if not public.world_guard_inquiry_can_open_v1((v->>'guardOrg')::uuid)
  or not public.world_guard_inquiry_can_review_v1((v->>'guardOrg')::uuid)
 then raise exception 'GUARD_VALID_CHAIR_NOT_RECOGNIZED'; end if;
 result:=public.world_open_guard_inquiry_v1(
  (v->>'guardOrg')::uuid,(v->>'targetCountry')::uuid,
  'A sourced formal compliance allegation requiring a country reply.',
  'GUARD Charter Article 14',due,op,'guard-inquiry-open-'||op::text
 );
 if result->>'status'<>'succeeded'
  or result #>> '{result,status}'<>'awaiting_response'
  or result #>> '{result,revision}'<>'1'
 then raise exception 'GUARD_INQUIRY_OPEN_RECEIPT_INVALID: %',result; end if;
 inquiry:=(result #>> '{result,inquiryId}')::uuid;
 replay:=public.world_open_guard_inquiry_v1(
  (v->>'guardOrg')::uuid,(v->>'targetCountry')::uuid,
  'A sourced formal compliance allegation requiring a country reply.',
  'GUARD Charter Article 14',due,op,'guard-inquiry-open-'||op::text
 );
 if coalesce((replay->>'replayed')::boolean,false) is not true
  or replay #>> '{result,inquiryId}'<>inquiry::text
 then raise exception 'GUARD_INQUIRY_IDEMPOTENCY_REPLAY_INVALID: %',replay; end if;
 perform set_config('solaris.guard_inquiry_case',inquiry::text,true);
 begin
  perform public.world_review_guard_inquiry_v1(
   inquiry,'no_action',null,
   'It is too early to review an unanswered inquiry while the response window remains open.',
   1,gen_random_uuid(),'guard-early-review-'||gen_random_uuid()::text
  );
  raise exception 'GUARD_REVIEW_BEFORE_DEADLINE_ALLOWED';
 exception when check_violation then null;
 end;
end $chair_open$;

do $outsider_case$
declare
 v jsonb:=current_setting('solaris.guard_inquiry_fixture')::jsonb;
 inquiry uuid:=current_setting('solaris.guard_inquiry_case')::uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 if exists(select 1 from public.world_guard_inquiries i where i.id=inquiry) then
  raise exception 'GUARD_OUTSIDER_PRIVATE_INQUIRY_VISIBLE';
 end if;
 if exists(select 1 from public.world_guard_inquiry_history h where h.inquiry_id=inquiry) then
  raise exception 'GUARD_OUTSIDER_PRIVATE_HISTORY_VISIBLE';
 end if;
end $outsider_case$;

do $country$
declare
 v jsonb:=current_setting('solaris.guard_inquiry_fixture')::jsonb;
 inquiry uuid:=current_setting('solaris.guard_inquiry_case')::uuid;
 op uuid:=gen_random_uuid();r jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'targetUser',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'targetUser','role','authenticated')::text,true);
 if (select count(*) from public.world_guard_inquiries i where i.id=inquiry)<>1 then
  raise exception 'GUARD_TARGET_CANNOT_READ_PRIVATE_INQUIRY'; end if;
 r:=public.world_respond_guard_inquiry_v1(
  inquiry,'The country formally disputes the allegation and supplies its complete response.',
  1,op,'guard-response-'||op::text
 );
 if r #>> '{result,status}'<>'response_received'
  or r #>> '{result,revision}'<>'2'
  or (r #>> '{result,wasLate}')::boolean is not false
 then raise exception 'GUARD_TARGET_RESPONSE_RECEIPT_INVALID: %',r; end if;
 if (select count(*) from public.world_guard_inquiry_responses response
   where response.inquiry_id=inquiry)<>1 then
  raise exception 'GUARD_RESPONSE_NOT_PERSISTED'; end if;
 begin
  perform public.world_respond_guard_inquiry_v1(
   inquiry,'An unauthorized second reply to an already answered inquiry.',
   2,gen_random_uuid(),'guard-second-response-'||gen_random_uuid()::text
  );
  raise exception 'GUARD_DUPLICATE_COUNTRY_RESPONSE_ALLOWED';
 exception when check_violation then null;
 end;
end $country$;

do $review$
declare
 v jsonb:=current_setting('solaris.guard_inquiry_fixture')::jsonb;
 inquiry uuid:=current_setting('solaris.guard_inquiry_case')::uuid;
 op uuid:=gen_random_uuid();r jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'chair',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
 r:=public.world_review_guard_inquiry_v1(
  inquiry,'recommend_action','assistance_freeze',
  'The Chairperson reviewed the country response and recommends separate lawful consideration.',
  2,op,'guard-review-'||op::text
 );
 if r #>> '{result/status}' is not null then
  raise exception 'GUARD_RESULT_SHAPE_UNEXPECTED'; end if;
 if r #>> '{result,status}'<>'reviewed'
  or r #>> '{result,revision}'<>'3'
  or r #>> '{result,recommendationOnly}'<>'true'
 then raise exception 'GUARD_REVIEW_RECEIPT_INVALID: %',r; end if;
 if (select count(*) from public.world_guard_inquiry_reviews x
  where x.inquiry_id=inquiry and x.proposed_action='assistance_freeze')<>1 then
  raise exception 'GUARD_RECOMMENDATION_NOT_RECORDED'; end if;
 if (select status from public.country_accounts
  where country_id=(v->>'targetCountry')::uuid)<>'active' then
  raise exception 'GUARD_REVIEW_CAUSED_UNAUTHORIZED_SUSPENSION'; end if;
 begin
  perform public.world_review_guard_inquiry_v1(
   inquiry,'no_action',null,
   'A duplicate completed inquiry review must not be permitted.',
   3,gen_random_uuid(),'guard-second-review-'||gen_random_uuid()::text
  );
  raise exception 'GUARD_DUPLICATE_REVIEW_ALLOWED';
 exception when check_violation then null;
 end;
end $review$;
reset role;

do $immutable$
declare inquiry uuid:=current_setting('solaris.guard_inquiry_case')::uuid;
begin
 begin
  update public.world_guard_inquiry_responses
   set response_text='Tampered' where inquiry_id=inquiry;
  raise exception 'GUARD_PRIVILEGED_RESPONSE_REWRITE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.world_guard_inquiry_reviews where inquiry_id=inquiry;
  raise exception 'GUARD_PRIVILEGED_REVIEW_DELETE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 if (select count(*) from public.world_guard_inquiry_history
  where inquiry_id=inquiry)<>3 then
  raise exception 'GUARD_IMMUTABLE_HISTORY_MISSING'; end if;
end $immutable$;
rollback;

do $cleanup$
begin
 if exists(select 1 from auth.users where email like '%@guard-inquiry.invalid') then
  raise exception 'GUARD_LOCAL_FIXTURE_PERSISTED'; end if;
 raise notice 'PASS: isolated GUARD inquiry authority, country response, review, privacy, audit and rollback';
end $cleanup$;
