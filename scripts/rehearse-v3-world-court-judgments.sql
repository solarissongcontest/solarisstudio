\set ON_ERROR_STOP on
-- WORLD-08 TG14: full action / authorization / privacy rehearsal.
-- RUN ONLY on disposable local Supabase using the checked loopback-only runner.
-- Every mutation is inside a transaction and the entire fixture is rolled back.
begin;
do $seed$
declare
 v_applicant uuid:=gen_random_uuid();
 v_respondent uuid:=gen_random_uuid();
 v_judge uuid:=gen_random_uuid();
 v_outsider uuid:=gen_random_uuid();
 v_app_country uuid:=gen_random_uuid();
 v_res_country uuid:=gen_random_uuid();
 v_judge_person uuid:=gen_random_uuid();
 v_org uuid;
 v_office uuid;
begin
 select id into v_org from public.world_organizations where slug='unity';
 if v_org is null then raise exception 'TG14_WORLD_FOUNDATION_NOT_MIGRATED'; end if;
 select office.id into v_office
 from public.world_organization_offices office
 where office.organization_id=v_org and office.slug='secretary-general';
 if v_office is null then raise exception 'TG14_SG_OFFICE_MISSING'; end if;
 if exists(select 1 from public.world_office_terms t
  where t.office_id=v_office and t.status='active' and t.actual_end_at is null) then
  raise exception 'TG14_FIXTURE_REQUIRES_DISPOSABLE_EMPTY_SG_OFFICE';
 end if;
 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (v_applicant,'authenticated','authenticated',v_applicant::text||'@tg14-judgment.invalid',now(),now()),
 (v_respondent,'authenticated','authenticated',v_respondent::text||'@tg14-judgment.invalid',now(),now()),
 (v_judge,'authenticated','authenticated',v_judge::text||'@tg14-judgment.invalid',now(),now()),
 (v_outsider,'authenticated','authenticated',v_outsider::text||'@tg14-judgment.invalid',now(),now());
 insert into public.countries(id,name,short_code) values
 (v_app_country,'TG14 Local Applicant','ZQA'),
 (v_res_country,'TG14 Local Respondent','ZQB');
 insert into public.country_accounts(user_id,country_id,status) values
 (v_applicant,v_app_country,'active'),
 (v_respondent,v_res_country,'active');
 insert into public.delegation_people(id,display_name,identity_key)
 values(v_judge_person,'TG14 Local Judicial Officer','tg14-judgment:'||v_judge_person::text);
 insert into public.world_office_terms(
  office_id,holder_person_id,holder_user_id,started_at,term_kind,status
 ) values(v_office,v_judge_person,v_judge,now()-interval '1 day','full','active');
 perform set_config('solaris.world_tg14_fixture',jsonb_build_object(
  'org',v_org,'office',v_office,'applicant',v_applicant,
  'respondent',v_respondent,'judge',v_judge,'outsider',v_outsider,
  'applicantCountry',v_app_country,'respondentCountry',v_res_country
 )::text,true);
end $seed$;

-- Pre-publication and outsider checks. These also prove release gate stays dark.
set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anon$
begin
 if public.world_court_public_docket_v1(20)<>'[]'::jsonb then
  raise exception 'TG14_ANON_DOCKET_LEAK';
 end if;
 begin
  perform id from public.world_court_judgments;
  raise exception 'TG14_ANON_RAW_JUDGMENT_READ';
 exception when insufficient_privilege then null;
 end;
end $anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 if public.world_court_judge_eligible_v1(gen_random_uuid()) then
  raise exception 'TG14_OUTSIDER_FABRICATED_JUDGE';
 end if;
 begin
  perform public.world_file_court_case_v1(
   (v->>'org')::uuid,(v->>'applicantCountry')::uuid,(v->>'respondentCountry')::uuid,
   'An unauthorized allegation from a non-controller.',
   'A specific legal provision.',
   'Formal legal enforcement.',
   gen_random_uuid(),'tg14-outsider-'||gen_random_uuid()::text
  );
  raise exception 'TG14_OUTSIDER_FILE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $outsider$;

do $file$
declare
 v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
 op uuid:=gen_random_uuid();
 result jsonb;
 replay jsonb;
 cid uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'applicant',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'applicant','role','authenticated')::text,true);
 result:=public.world_file_court_case_v1(
  (v->>'org')::uuid,(v->>'applicantCountry')::uuid,(v->>'respondentCountry')::uuid,
  'The local applicant asserts a formally disputed international matter.',
  'The applicable UNITY Charter and the official published rules.',
  'The Court is requested to issue a binding formal ruling.',
  op,'tg14-file-'||op::text
 );
 if result->>'status'<>'succeeded' or result #>> '{result,status}'<>'filed'
   or result #>> '{result,revision}'<>'1' then
  raise exception 'TG14_FILE_RECEIPT_INVALID: %',result;
 end if;
 cid:=(result #>> '{result,caseId}')::uuid;
 replay:=public.world_file_court_case_v1(
  (v->>'org')::uuid,(v->>'applicantCountry')::uuid,(v->>'respondentCountry')::uuid,
  'The local applicant asserts a formally disputed international matter.',
  'The applicable UNITY Charter and the official published rules.',
  'The Court is requested to issue a binding formal ruling.',
  op,'tg14-file-'||op::text
 );
 if coalesce((replay->>'replayed')::boolean,false) is not true
  or replay #>> '{result,caseId}'<>cid::text then
  raise exception 'TG14_FILE_REPLAY_INVALID: %',replay;
 end if;
 perform set_config('solaris.world_tg14_case',cid::text,true);
end $file$;
reset role;

-- After filing, neither anon nor a random authenticated viewer may inspect a case.
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $private$
declare
 v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
 cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 if exists(select 1 from public.world_court_cases c where c.id=cid) then
  raise exception 'TG14_OUTSIDER_PRIVATE_CASE_VISIBLE';
 end if;
 if exists(select 1 from public.world_court_filings f where f.case_id=cid) then
  raise exception 'TG14_OUTSIDER_PRIVATE_PLEADING_VISIBLE';
 end if;
 if public.world_court_public_judgments_v1(cid)<>'[]'::jsonb then
  raise exception 'TG14_OUTSIDER_UNPUBLISHED_JUDGMENT_VISIBLE';
 end if;
end $private$;

-- Respondent can reply once, but its response never manufactures a judgment.
do $respond$
declare
 v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
 cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
 op uuid:=gen_random_uuid();r jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'respondent',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'respondent','role','authenticated')::text,true);
 r:=public.world_respond_to_court_case_v1(
  cid,'The respondent respectfully challenges the factual and legal allegations.',
  1,op,'tg14-response-'||op::text
 );
 if r #>> '{result,revision}'<>'2' then
  raise exception 'TG14_RESPONDENT_RECEIPT_INVALID: %',r;
 end if;
end $respond$;

-- A current, effective UNITY Secretary-General advances the real case.
do $judge$
declare
 v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
 cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
 op uuid;r jsonb;
 rev integer:=2;
 destination text;
begin
 perform set_config('request.jwt.claim.sub',v->>'judge',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'judge','role','authenticated')::text,true);
 if not public.world_court_judge_eligible_v1(cid) then
  raise exception 'TG14_SG_OFFICE_AUTHORITY_MISSING';
 end if;
 foreach destination in array array['preliminary_review','proceedings','judgment_pending']
 loop
  op:=gen_random_uuid();
  r:=public.world_advance_court_case_v1(cid,destination,
   'Recorded local judicial procedural justification.',rev,
   op,'tg14-procedure-'||op::text);
  if r #>> '{result,revision}'<>(rev+1)::text then
   raise exception 'TG14_PROCEDURE_RECEIPT_INVALID: %',r;
  end if;
  rev:=rev+1;
 end loop;
 op:=gen_random_uuid();
 r:=public.world_issue_court_judgment_v1(
  cid,'The Court determined the controlling facts and country participation.',
  'The applicable Charter rules were construed under current official authority.',
  'Both parties must comply with the issued direction.',
  'The respondent must implement the specified corrective measure.',
  false,5,op,'tg14-first-judgment-'||op::text
 );
 if r #>> '{result,status}'<>'decided' or r #>> '{result,revision}'<>'6' then
  raise exception 'TG14_FIRST_JUDGMENT_NOT_RECORDED: %',r;
 end if;
 if (select count(*) from public.world_court_judgments j
      where j.case_id=cid and j.kind='original')<>1 then
  raise exception 'TG14_ORIGINAL_MISSING';
 end if;
 if public.world_court_public_judgments_v1(cid)<>'[]'::jsonb then
  raise exception 'TG14_PRIVATE_JUDGMENT_IN_PUBLIC_RPC';
 end if;
end $judge$;
reset role;

-- Both countries file ONE reconsideration request per judgment.
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $parties$
declare
 v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
 cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
 judgment uuid;op uuid;r jsonb;
begin
 select j.id into judgment from public.world_court_judgments j
 where j.case_id=cid and j.kind='original';
 perform set_config('solaris.world_tg14_original',judgment::text,true);
 perform set_config('request.jwt.claim.sub',v->>'applicant',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'applicant','role','authenticated')::text,true);
 op:=gen_random_uuid();
 r:=public.world_request_court_reconsideration_v1(
  cid,judgment,'The initial finding conflicts with a newly verified chronological fact.',
  6,op,'tg14-applicant-reconsider-'||op::text
 );
 if r #>> '{result,revision}'<>'7' then
  raise exception 'TG14_FIRST_RECONSIDERATION_INVALID';
 end if;
 perform set_config('request.jwt.claim.sub',v->>'respondent',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'respondent','role','authenticated')::text,true);
 op:=gen_random_uuid();
 r:=public.world_request_court_reconsideration_v1(
  cid,judgment,'The original legal reasoning omitted a newly material constitutional section.',
  7,op,'tg14-respondent-reconsider-'||op::text
 );
 if r #>> '{result,revision}'<>'8' then
  raise exception 'TG14_SECOND_RECONSIDERATION_INVALID';
 end if;
 -- Third request from the same country for the same judgment is always denied.
 begin
  perform public.world_request_court_reconsideration_v1(
   cid,judgment,'The duplicate request must not be admitted as a second review.',
   8,gen_random_uuid(),'tg14-duplicate-'||gen_random_uuid()::text);
  raise exception 'TG14_DUPLICATE_COUNTRY_RECONSIDERATION_ALLOWED';
 exception when unique_violation then null;
 end;
end $parties$;

do $decide$
declare
 v jsonb:=current_setting('solaris.world_tg14_fixture')::jsonb;
 cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
 original uuid:=current_setting('solaris.world_tg14_original')::uuid;
 first_id uuid;second_id uuid;op uuid;r jsonb;
begin
 select id into first_id from public.world_court_reconsiderations
 where case_id=cid and party_country_id=(v->>'applicantCountry')::uuid;
 select id into second_id from public.world_court_reconsiderations
 where case_id=cid and party_country_id=(v->>'respondentCountry')::uuid;
 perform set_config('request.jwt.claim.sub',v->>'judge',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'judge','role','authenticated')::text,true);
 op:=gen_random_uuid();
 r:=public.world_decide_court_reconsideration_v1(
  first_id,'accepted','The applicant identified a material overlooked official record.',
  8,op,'tg14-first-review-'||op::text
 );
 if r #>> '{result,status}'<>'reconsideration'
   or r #>> '{result,revision}'<>'9' then
  raise exception 'TG14_FIRST_REVIEW_DECISION_INVALID: %',r;
 end if;
 -- No revised judgment while the other party has a still-pending request.
 begin
  perform public.world_issue_court_judgment_v1(
   cid,'Premature revised findings before all pending requests are decided.',
   'Publication must wait for both pending reconsideration requests.',
   'This decision must not be committed.',
   'No remedy before completion.',
   true,9,gen_random_uuid(),'tg14-premature-'||gen_random_uuid()::text
  );
  raise exception 'TG14_PREMATURE_REVISED_JUDGMENT_ALLOWED';
 exception when check_violation then null;
 end;
 -- Another party's rejection must not extinguish the accepted review.
 op:=gen_random_uuid();
 r:=public.world_decide_court_reconsideration_v1(
  second_id,'rejected','The respondent has not shown a qualifying material error.',
  9,op,'tg14-second-review-'||op::text
 );
 if r #>> '{result,status}'<>'reconsideration'
  or r #>> '{result,revision}'<>'10' then
  raise exception 'TG14_ACCEPTED_REVIEW_INCORRECTLY_CLEARED';
 end if;
 op:=gen_random_uuid();
 r:=public.world_issue_court_judgment_v1(
  cid,'The corrected findings preserve both parties and establish the new record.',
  'The Charter applies to the newly verified evidence and submitted pleadings.',
  'The previously issued directions are replaced by the revised order.',
  'Both countries must acknowledge the corrected formal remedy.',
  true,10,op,'tg14-revised-judgment-'||op::text
 );
 if r #>> '{result,status}'<>'decided'
  or r #>> '{result,revision}'<>'11' then
  raise exception 'TG14_REVISED_JUDGMENT_MISSING: %',r;
 end if;
 if (select count(*) from public.world_court_judgments j where j.case_id=cid)<>2 then
  raise exception 'TG14_ORIGINAL_WAS_OVERWRITTEN';
 end if;
end $decide$;
reset role;

-- A public case is still dark while the system-wide World rollout flag is off.
set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $dark$
declare cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
begin
 if public.world_court_public_judgments_v1(cid)<>'[]'::jsonb
  or public.world_court_public_docket_v1(20)<>'[]'::jsonb then
  raise exception 'TG14_PUBLIC_ROLLOUT_BYPASS';
 end if;
end $dark$;
reset role;

-- Database-wide rollout flag change is permitted ONLY in this rollback fixture.
-- It never touches hosted production or survives this transaction.
update public.studio2_feature_flags set enabled=true where key='terra_world_public';
set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $public$
declare cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
 v jsonb;
begin
 v:=public.world_court_public_judgments_v1(cid);
 if jsonb_array_length(v)<>1 or v->0->>'kind'<>'revised' then
  raise exception 'TG14_PUBLISHED_REVISED_JUDGMENT_INCORRECT: %',v;
 end if;
 if v::text like '%filed_by_user_id%' or v::text like '%related_filing_ids%'
  or v::text like '%grounds%' or v::text like '%issued_by_user_id%' then
  raise exception 'TG14_PRIVATE_EVIDENCE_IN_PUBLIC_JUDGMENT';
 end if;
 if jsonb_array_length(public.world_court_public_docket_v1(50))<>1 then
  raise exception 'TG14_PUBLIC_DOCKET_ENTRY_MISSING';
 end if;
end $public$;
reset role;

-- Privileged raw edits still cannot rewrite immutable history. The published
-- record must survive account deletion; rollback isolates these checks.
do $immutable$
declare cid uuid:=current_setting('solaris.world_tg14_case')::uuid;
begin
 begin
  update public.world_court_judgments set findings='Tampered' where case_id=cid;
  raise exception 'TG14_PRIVILEGED_JUDGMENT_TAMPERING_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.world_court_reconsiderations where case_id=cid;
  raise exception 'TG14_PRIVILEGED_RECONSIDERATION_DELETION_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 if (select count(*) from public.world_court_judgments where case_id=cid)<>2
  or (select count(*) from public.world_court_reconsiderations where case_id=cid)<>2 then
  raise exception 'TG14_IMMUTABLE_HISTORY_LOST';
 end if;
end $immutable$;
rollback;

do $rolled_back$
begin
 if exists(select 1 from auth.users where email like '%@tg14-judgment.invalid') then
  raise exception 'TG14_LOCAL_FIXTURE_PERSISTED';
 end if;
 raise notice 'PASS: TG14 Court judgment, privacy, reconsideration and rollback rehearsal';
end $rolled_back$;
