-- Rollback-only TG5B rehearsal. Run ONLY through the loopback-only shell wrapper.
\set ON_ERROR_STOP on
begin;

do $seed$
declare
  v_applicant uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_chair uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_guard uuid;
  v_review_office uuid := gen_random_uuid();
  v_chair_office uuid := gen_random_uuid();
  v_review_person uuid := gen_random_uuid();
  v_chair_person uuid := gen_random_uuid();
begin
  select id into strict v_guard from public.world_organizations where slug='guard';
  if to_regprocedure('public.world_review_guard_application_v1(uuid,uuid,uuid,bigint,text,uuid,text)') is null
     or to_regprocedure('public.world_guard_review_inbox_v1(text,timestamptz,uuid)') is null then
    raise exception 'TG5_REVIEW_RPC_MISSING';
  end if;
  if has_function_privilege(
       'anon','public.world_review_guard_application_v1(uuid,uuid,uuid,bigint,text,uuid,text)','EXECUTE')
     or has_function_privilege(
       'anon','public.world_guard_review_inbox_v1(text,timestamptz,uuid)','EXECUTE')
     or has_table_privilege(
       'authenticated','public.world_membership_application_review_history','SELECT')
     or has_table_privilege(
       'authenticated','public.world_membership_application_review_history','INSERT') then
    raise exception 'TG5_REVIEW_UNSAFE_GRANTS';
  end if;
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_applicant,'authenticated','authenticated',v_applicant::text || '@tg5-review.invalid',now(),now()),
    (v_reviewer,'authenticated','authenticated',v_reviewer::text || '@tg5-review.invalid',now(),now()),
    (v_chair,'authenticated','authenticated',v_chair::text || '@tg5-review.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text || '@tg5-review.invalid',now(),now());
  insert into public.countries(id,name,short_code)
  values(v_country,'TG5 Review Test Country','TRZ');
  insert into public.country_accounts(user_id,country_id,status)
  values(v_applicant,v_country,'active');
  insert into public.delegation_people(id,display_name,identity_key)
  values
    (v_review_person,'TG5 Reviewer','tg5-review:' || v_review_person::text),
    (v_chair_person,'TG5 Chair','tg5-review:' || v_chair_person::text);
  insert into public.world_organization_offices
    (id,organization_id,slug,title,office_type,appointment_method)
  values
    (v_review_office,v_guard,'tg5-review-' || replace(v_review_office::text,'-',''),
     'TG5 Review Officer','executive_leader','appointment'),
    (v_chair_office,v_guard,'tg5-review-' || replace(v_chair_office::text,'-',''),
     'TG5 Introducer','executive_leader','appointment');
  insert into public.world_office_capabilities(office_id,capability)
  values
    (v_review_office,'world.membership.review'),
    (v_chair_office,'world.membership.review'),
    (v_chair_office,'world.membership.introduce');
  insert into public.world_office_terms
    (office_id,holder_person_id,holder_user_id,started_at,term_kind,status)
  values
    (v_review_office,v_review_person,v_reviewer,now()-interval '1 day','full','active'),
    (v_chair_office,v_chair_person,v_chair,now()-interval '1 day','full','active');
  perform set_config('solaris.tg5_review_fixture',
    jsonb_build_object(
      'applicant',v_applicant,'reviewer',v_reviewer,
      'chair',v_chair,'outsider',v_outsider,
      'country',v_country,'organization',v_guard
    )::text,true);
end
$seed$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $application$
declare
  v jsonb := current_setting('solaris.tg5_review_fixture')::jsonb;
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'applicant',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'applicant','role','authenticated')::text,true);
  v_result := public.world_submit_guard_membership_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    'Republic of TG5 Review','Parliamentary republic',
    'Our country seeks to join GUARD for international cooperation.',
    'We can provide technical support and international logistics.',
    'We undertake to respect the international responsibilities of GUARD.',
    gen_random_uuid(),'tg5-review-submit:' || gen_random_uuid()::text
  );
  if v_result->>'status' <> 'succeeded'
     or v_result#>>'{result,status}' <> 'submitted' then
    raise exception 'TG5_REVIEW_APPLICATION_SUBMISSION_FAILED: %',v_result;
  end if;
  perform set_config('solaris.tg5_review_application',
    v_result#>>'{result,applicationId}',true);
  raise notice 'PASS: controller submitted one real governed application';
end
$application$;

do $unauthorized$
declare v jsonb := current_setting('solaris.tg5_review_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_guard_review_inbox_v1('submitted',null,null);
    raise exception 'TG5_REVIEW_OUTSIDER_READ_ALLOWED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'AUTHORIZATION' then raise; end if;
  end;
  begin
    perform public.world_review_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      current_setting('solaris.tg5_review_application')::uuid,
      1,'review',gen_random_uuid(),'tg5-review-outside:' || gen_random_uuid()::text);
    raise exception 'TG5_REVIEW_OUTSIDER_WRITE_ALLOWED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'AUTHORIZATION' then raise; end if;
  end;
  raise notice 'PASS: unrelated account cannot read or mutate private review';
end
$unauthorized$;

do $reviewer$
declare
  v jsonb := current_setting('solaris.tg5_review_fixture')::jsonb;
  v_inbox jsonb;
  v_receipt jsonb;
  v_operation uuid := gen_random_uuid();
  v_key text := 'tg5-review-start:' || gen_random_uuid()::text;
begin
  perform set_config('request.jwt.claim.sub',v->>'reviewer',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'reviewer','role','authenticated')::text,true);
  v_inbox := public.world_guard_review_inbox_v1('submitted',null,null);
  if v_inbox->>'canIntroduce' <> 'false'
     or jsonb_array_length(v_inbox->'items') <> 1
     or (v_inbox#>>'{items,0,motivation}') not like '%international cooperation%' then
    raise exception 'TG5_REVIEW_PRIVILEGED_INBOX_INVALID: %',v_inbox;
  end if;
  begin
    perform public.world_review_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      current_setting('solaris.tg5_review_application')::uuid,
      1,'introduce',gen_random_uuid(),'tg5-review-forbidden:' || gen_random_uuid()::text);
    raise exception 'TG5_REVIEWER_INTRODUCTION_PRIVILEGE_ESCALATION';
  exception when sqlstate '42501' then
    if sqlerrm <> 'AUTHORIZATION' then raise; end if;
  end;
  v_receipt := public.world_review_guard_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    current_setting('solaris.tg5_review_application')::uuid,
    1,'review',v_operation,v_key);
  if v_receipt->>'status'<>'succeeded'
     or v_receipt#>>'{result,status}'<>'under_review'
     or v_receipt#>>'{result,revision}'<>'2' then
    raise exception 'TG5_REVIEW_STATE_RECEIPT_INVALID: %',v_receipt;
  end if;
  v_receipt := public.world_review_guard_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    current_setting('solaris.tg5_review_application')::uuid,
    1,'review',v_operation,v_key);
  if v_receipt->>'replayed'<>'true'
     or v_receipt#>>'{result,revision}'<>'2' then
    raise exception 'TG5_REVIEW_IDEMPOTENCY_FAILED: %',v_receipt;
  end if;
  begin
    perform public.world_review_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      current_setting('solaris.tg5_review_application')::uuid,
      1,'review',gen_random_uuid(),'tg5-review-stale:' || gen_random_uuid()::text);
    raise exception 'TG5_REVIEW_STALE_REVISION_ACCEPTED';
  exception when sqlstate '40001' then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;
  raise notice 'PASS: reviewer authority, CAS and idempotent receipt';
end
$reviewer$;

do $chair$
declare
  v jsonb := current_setting('solaris.tg5_review_fixture')::jsonb;
  v_inbox jsonb;
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'chair',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
  v_inbox := public.world_guard_review_inbox_v1('under_review',null,null);
  if v_inbox->>'canIntroduce'<>'true'
     or jsonb_array_length(v_inbox->'items') <> 1 then
    raise exception 'TG5_REVIEW_CHAIR_AUTHORITY_INVALID: %',v_inbox;
  end if;
  v_result := public.world_review_guard_application_v1(
    (v->>'organization')::uuid,(v->>'country')::uuid,
    current_setting('solaris.tg5_review_application')::uuid,
    2,'introduce',gen_random_uuid(),'tg5-review-introduce:' || gen_random_uuid()::text);
  if v_result->>'status'<>'succeeded'
     or v_result#>>'{result,status}'<>'introduced'
     or v_result#>>'{result,revision}'<>'3' then
    raise exception 'TG5_REVIEW_INTRODUCTION_RECEIPT_INVALID: %',v_result;
  end if;
  raise notice 'PASS: authorized Chair introduced after review without admission';
end
$chair$;

do $applicant_denial$
declare v jsonb := current_setting('solaris.tg5_review_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'applicant',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'applicant','role','authenticated')::text,true);
  begin
    perform public.world_withdraw_guard_application_v1(
      (v->>'organization')::uuid,(v->>'country')::uuid,
      current_setting('solaris.tg5_review_application')::uuid,
      3,gen_random_uuid(),'tg5-introduced-withdraw:' || gen_random_uuid()::text);
    raise exception 'TG5_REVIEW_INTRODUCED_APPLICATION_WITHDRAWAL_ALLOWED';
  exception when sqlstate '23514' then
    if sqlerrm <> 'APPLICATION_LOCKED' then raise; end if;
  end;
  raise notice 'PASS: introduced application cannot be silently withdrawn';
end
$applicant_denial$;
reset role;

do $final$
declare
  v jsonb := current_setting('solaris.tg5_review_fixture')::jsonb;
  v_app uuid := current_setting('solaris.tg5_review_application')::uuid;
begin
  if (select count(*) from public.world_membership_application_review_history
      where application_id=v_app) <> 2 then
    raise exception 'TG5_REVIEW_DURABLE_AUDIT_HISTORY_MISSING';
  end if;
  if (select status from public.world_membership_applications where id=v_app) <> 'introduced' then
    raise exception 'TG5_REVIEW_FINAL_APPLICATION_STATE_WRONG';
  end if;
  if exists(
    select 1 from public.world_organization_memberships
    where organization_id=(v->>'organization')::uuid
      and country_id=(v->>'country')::uuid
  ) then
    raise exception 'TG5_REVIEW_UNAUTHORIZED_MEMBERSHIP_ACTIVATION';
  end if;
  raise notice 'PASS: two immutable review events; no membership, representation or voting authority created';
end
$final$;

rollback;

do $clean$
begin
  if exists(select 1 from auth.users where email like '%@tg5-review.invalid')
     or exists(select 1 from public.world_organization_offices
                where slug like 'tg5-review-%') then
    raise exception 'TG5_REVIEW_FIXTURE_NOT_ROLLED_BACK';
  end if;
  raise notice 'PASS: disposable fixtures rolled back';
end
$clean$;