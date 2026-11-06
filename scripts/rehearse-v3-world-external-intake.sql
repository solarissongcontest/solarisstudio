\set ON_ERROR_STOP on
-- WORLD-05 TG7: disposable local PostgreSQL only, every fixture rolls back.
begin;
do $fixture$
declare
 v_officer uuid:=gen_random_uuid();
 v_outsider uuid:=gen_random_uuid();
 v_person uuid:=gen_random_uuid();
 v_org uuid:=gen_random_uuid();
 v_organ uuid:=gen_random_uuid();
 v_office uuid:=gen_random_uuid();
 v_country uuid:=gen_random_uuid();
begin
 if to_regprocedure('public.world_record_external_intake_v1(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,uuid)') is null
   or to_regprocedure('public.world_introduce_external_measure_v1(uuid,uuid,text,text,bigint,uuid,text,uuid)') is null
   or to_regprocedure('public.world_external_intakes_manage_v1(uuid)') is null then
   raise exception 'TG7_EXTERNAL_REQUIRED_RPCS_MISSING'; end if;
 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (v_officer,'authenticated','authenticated',v_officer::text||'@tg7-external.invalid',now(),now()),
 (v_outsider,'authenticated','authenticated',v_outsider::text||'@tg7-external.invalid',now(),now());
 insert into public.delegation_people(id,display_name,identity_key) values
 (v_person,'TG7 External Reviewer','tg7-external:'||v_person::text);
 insert into public.countries(id,name,short_code)
 values (v_country,'TG7 External Country','XZX');
 insert into public.world_organizations
 (id,slug,official_name,short_name,type,status,public_visibility)
 values (v_org,'tg7-external-'||replace(v_org::text,'-',''),
 'TG7 External Institution','TG7 External','international_organization','active','public');
 insert into public.world_organization_organs
 (id,organization_id,slug,name,status,visibility)
 values (v_organ,v_org,'assembly','TG7 External Assembly','active','public');
 insert into public.world_organization_memberships
 (organization_id,country_id,membership_type,status,joined_at)
 values (v_org,v_country,'member','member',now()-interval '2 days');
 insert into public.world_organization_offices
 (id,organization_id,slug,title,office_type,appointment_method)
 values (v_office,v_org,'intake-chair','TG7 Intake Chair','executive_leader','appointment');
 insert into public.world_office_terms
 (office_id,holder_person_id,holder_user_id,started_at,term_kind,status)
 values (v_office,v_person,v_officer,now()-interval '1 day','appointed','active');
 insert into public.world_office_capabilities(office_id,capability)
 values(v_office,'world.measure.register_external');
 update public.studio2_platform_operational_state
 set mode='normal',version=version+1 where singleton=true;
 perform set_config('solaris.tg7_external_fixture',
 jsonb_build_object('officer',v_officer,'outsider',v_outsider,
 'org',v_org,'organ',v_organ,'country',v_country,
 'recordOperation',gen_random_uuid(),'introduceOperation',gen_random_uuid())::text,true);
end $fixture$;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anon$
declare v jsonb:=current_setting('solaris.tg7_external_fixture')::jsonb;
begin
 begin
  perform public.world_external_intakes_manage_v1((v->>'org')::uuid);
  raise exception 'TG7_ANON_READ_PRIVILEGE';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from private.world_measure_intakes;
  raise exception 'TG7_ANON_RAW_PRIVATE_SELECT';
 exception when insufficient_privilege then null; end;
 begin
  perform public.world_record_external_intake_v1(
   (v->>'org')::uuid,(v->>'country')::uuid,'dm','DM #1','Source title',
   'Source text','Real received message','[]'::jsonb,
   gen_random_uuid(),'tg7-anon-identity');
  raise exception 'TG7_ANON_RECORD_ALLOWED';
 exception when insufficient_privilege then null; end;
end $anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.tg7_external_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 if public.world_external_intakes_manage_v1((v->>'org')::uuid) is not null then
  raise exception 'TG7_OUTSIDER_PRIVATE_MESSAGE_LEAK'; end if;
 begin
  perform public.world_record_external_intake_v1(
   (v->>'org')::uuid,(v->>'country')::uuid,'instagram','DM #1','Source title',
   'Source text','Real source note','[]'::jsonb,
   gen_random_uuid(),'tg7-outsider-record');
  raise exception 'TG7_OUTSIDER_RECORD_ALLOWED';
 exception when insufficient_privilege then null; end;
end $outsider$;

do $record$
declare
 v jsonb:=current_setting('solaris.tg7_external_fixture')::jsonb;
 v_once jsonb;v_twice jsonb;v_id uuid;
begin
 perform set_config('request.jwt.claim.sub',v->>'officer',true);
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',v->>'officer','role','authenticated')::text,true);
 v_once:=public.world_record_external_intake_v1(
  (v->>'org')::uuid,(v->>'country')::uuid,'instagram',' DM #1 ',
  'Source title','Source text',' Real source note ','[]'::jsonb,
  (v->>'recordOperation')::uuid,
  'world.measure.external_intake.record:'||(v->>'recordOperation'));
 if v_once->>'status'<>'succeeded' or
    v_once #>> '{result,status}'<>'received' or
    length(v_once #>> '{result,contentHash}')<>64 then
  raise exception 'TG7_EXTERNAL_RECORD_RECEIPT_INVALID: %',v_once; end if;
 v_id:=(v_once #>> '{result,intakeId}')::uuid;
 if v_id is null then raise exception 'TG7_NO_EXTERNAL_INTAKE_ID'; end if;
 perform set_config('solaris.tg7_external_intake_id',v_id::text,true);
 v_twice:=public.world_record_external_intake_v1(
  (v->>'org')::uuid,(v->>'country')::uuid,'instagram',' DM #1 ',
  'Source title','Source text',' Real source note ','[]'::jsonb,
  (v->>'recordOperation')::uuid,
  'world.measure.external_intake.record:'||(v->>'recordOperation'));
 if v_twice->>'replayed'<>'true' or
    v_twice #>> '{result,intakeId}'<>v_id::text then
  raise exception 'TG7_RECORD_REPLAY_NOT_STABLE'; end if;
 if (select count(*) from private.world_measure_intakes
   where organization_id=(v->>'org')::uuid)<>1 then
  raise exception 'TG7_DUPLICATE_EXTERNAL_MESSAGE'; end if;
 if exists(select 1 from public.world_measures where intake_id=v_id) then
  raise exception 'TG7_INTAKE_CREATED_FORMAL_MEASURE'; end if;
 if (select source_reference from private.world_measure_intakes where id=v_id)<>'DM #1'
   or (select source_note from private.world_measure_intakes where id=v_id)<>'Real source note' then
  raise exception 'TG7_PROVENANCE_NORMALIZATION_DRIFT'; end if;
end $record$;

do $introduce$
declare
 v jsonb:=current_setting('solaris.tg7_external_fixture')::jsonb;
 v_id uuid:=current_setting('solaris.tg7_external_intake_id')::uuid;
 v_once jsonb;v_twice jsonb;v_measure uuid;
begin
 v_once:=public.world_introduce_external_measure_v1(v_id,
  (v->>'organ')::uuid,'proposal',null,1,
  (v->>'introduceOperation')::uuid,
  'world.measure.external_intake.introduce:'||(v->>'introduceOperation'));
 if v_once->>'status'<>'succeeded' or
    v_once #>> '{result,status}'<>'introduced' then
  raise exception 'TG7_EXTERNAL_INTRODUCTION_RECEIPT_INVALID: %',v_once; end if;
 v_measure:=(v_once #>> '{result,measureId}')::uuid;
 if v_measure is null then raise exception 'TG7_NO_FORMAL_MEASURE'; end if;
 v_twice:=public.world_introduce_external_measure_v1(v_id,
  (v->>'organ')::uuid,'proposal',null,1,
  (v->>'introduceOperation')::uuid,
  'world.measure.external_intake.introduce:'||(v->>'introduceOperation'));
 if v_twice->>'replayed'<>'true' or
    v_twice #>> '{result,measureId}'<>v_measure::text then
  raise exception 'TG7_INTRODUCTION_REPLAY_FAILED'; end if;
 if (select count(*) from public.world_measures where intake_id=v_id)<>1 then
  raise exception 'TG7_DUPLICATED_FORMAL_MEASURE'; end if;
 if not exists (
  select 1 from public.world_measures m
  join public.world_measure_versions ver on ver.id=m.current_version_id
  where m.id=v_measure and m.source_channel='instagram'
   and m.visibility='members' and m.state='submitted'
   and m.identifier is null and ver.publication_state='draft'
   and ver.full_text='Source text'
 ) then raise exception 'TG7_PREMATURE_REGISTRATION_OR_PROVENANCE_LOSS'; end if;
 if public.world_measure_public_detail_v1(v_measure) is not null then
  raise exception 'TG7_UNREGISTERED_EXTERNAL_PROPOSAL_PUBLICLY_VISIBLE'; end if;
 begin
  perform public.world_introduce_external_measure_v1(v_id,
   (v->>'organ')::uuid,'proposal',null,1,
   gen_random_uuid(),'tg7-second-introduction');
  raise exception 'TG7_DUPLICATE_INTRODUCTION_ACCEPTED';
 exception when serialization_failure then null; end;
end $introduce$;
reset role;

set local role service_role;
do $service$
begin
 begin
  update private.world_measure_intakes
  set raw_text='forged' where false;
  raise exception 'TG7_SERVICE_ROLE_RAW_EVIDENCE_WRITER';
 exception when insufficient_privilege then null; end;
end $service$;
reset role;

rollback;
do $clean$
begin
 if exists(select 1 from auth.users where email like '%@tg7-external.invalid')
   or exists(select 1 from public.world_organizations where slug like 'tg7-external-%') then
  raise exception 'TG7_EXTERNAL_REHEARSAL_NOT_ROLLED_BACK'; end if;
 raise notice 'PASS: TG7 external private provenance, single introduction, denial and rollback';
end $clean$;
