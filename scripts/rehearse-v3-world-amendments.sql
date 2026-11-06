\set ON_ERROR_STOP on
-- WORLD-05 TG7: local-only, complete rollback. No production connection.
begin;
do $fixture$
declare
 v_sponsor uuid:=gen_random_uuid();
 v_other uuid:=gen_random_uuid();
 v_person uuid:=gen_random_uuid();
 v_country uuid:=gen_random_uuid();
 v_org uuid:=gen_random_uuid();
 v_organ uuid:=gen_random_uuid();
 v_measure uuid:=gen_random_uuid();
 v_version uuid:=gen_random_uuid();
begin
 if to_regprocedure('public.world_submit_measure_amendment_v1(uuid,uuid,uuid,text,text,text,bigint,uuid,text,uuid)') is null
  or to_regprocedure('public.world_withdraw_measure_amendment_v1(uuid,bigint,uuid,text,uuid)') is null
 then raise exception 'TG7_AMENDMENT_RPC_MISSING'; end if;
 if not exists(select 1 from public.studio2_feature_flags
    where key='terra_world_public' and enabled=false) then
   raise exception 'TG7_WORLD_ROLLOUT_NOT_DISABLED'; end if;
 update public.studio2_feature_flags set enabled=true where key='terra_world_public';
 update public.studio2_platform_operational_state
 set mode='normal',version=version+1 where singleton=true;
 insert into auth.users(id,aud,role,email,created_at,updated_at) values
 (v_sponsor,'authenticated','authenticated',v_sponsor::text||'@tg7-amend.invalid',now(),now()),
 (v_other,'authenticated','authenticated',v_other::text||'@tg7-amend.invalid',now(),now());
 insert into public.delegation_people(id,display_name,identity_key)
 values(v_person,'TG7 Amendment Controller','tg7-amend:'||v_person::text);
 insert into public.countries(id,name,short_code)
 values(v_country,'TG7 Amendment Country','XZY');
 insert into public.country_accounts(user_id,country_id,status)
 values(v_sponsor,v_country,'active');
 insert into public.world_organizations
 (id,slug,official_name,short_name,type,status,public_visibility)
 values(v_org,'tg7-amend-'||replace(v_org::text,'-',''),
 'TG7 Amendment Organization','TG7 Amend','international_organization','active','public');
 insert into public.world_organization_organs
 (id,organization_id,slug,name,status,visibility)
 values(v_organ,v_org,'assembly','TG7 Amendment Assembly','active','public');
 insert into public.world_organization_memberships
 (organization_id,country_id,membership_type,status,joined_at)
 values(v_org,v_country,'member','member',now()-interval '2 days');
 insert into public.world_measures
 (id,organization_id,organ_id,identifier,measure_type,title,sponsor_country_id,
  state,visibility,registered_at)
 values(v_measure,v_org,v_organ,'TGA.2026.1.XZY.A','proposal',
 'Amendment Source Measure',v_country,'submitted','public',now()-interval '1 day');
 insert into public.world_measure_versions
 (id,measure_id,version_number,title,full_text,content_hash,publication_state)
 values(v_version,v_measure,1,'Amendment Source Measure',
  'Opening paragraph. Replace this exact passage. Closing paragraph.',
  encode(sha256(convert_to('Opening paragraph. Replace this exact passage. Closing paragraph.','UTF8')),'hex'),
  'published');
 update public.world_measures
 set current_version_id=v_version,state='registered',revision=revision+1
 where id=v_measure;
 perform set_config('solaris.tg7_amendment_fixture',jsonb_build_object(
  'sponsor',v_sponsor,'other',v_other,'country',v_country,
  'org',v_org,'organ',v_organ,'measure',v_measure,'version',v_version,
  'submitOperation',gen_random_uuid(),'withdrawOperation',gen_random_uuid()
 )::text,true);
end $fixture$;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anon$
declare v jsonb:=current_setting('solaris.tg7_amendment_fixture')::jsonb;
begin
 begin
  perform public.world_submit_measure_amendment_v1(
   (v->>'measure')::uuid,(v->>'country')::uuid,(v->>'version')::uuid,
   'Replace this exact passage','Better constitutional language',
   'An important procedural change',2,
   gen_random_uuid(),'tg7-anon-submit');
  raise exception 'TG7_ANON_AMENDMENT_ACCEPTED';
 exception when insufficient_privilege then null; end;
 begin
  perform 1 from public.world_measure_amendments;
  raise exception 'TG7_ANON_AMENDMENT_TABLE_READ';
 exception when insufficient_privilege then null; end;
end $anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $other$
declare v jsonb:=current_setting('solaris.tg7_amendment_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'other',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'other','role','authenticated')::text,true);
 if public.world_measure_amendments_manage_v1((v->>'measure')::uuid) is not null then
  raise exception 'TG7_UNAUTHORIZED_AMENDMENT_READ'; end if;
 begin
  perform public.world_submit_measure_amendment_v1(
   (v->>'measure')::uuid,(v->>'country')::uuid,(v->>'version')::uuid,
   'Replace this exact passage','Better constitutional language',
   'An important procedural change',2,
   gen_random_uuid(),'tg7-other-submit');
  raise exception 'TG7_OTHER_COUNTRY_AMENDMENT_ACCEPTED';
 exception when insufficient_privilege then null; end;
end $other$;

do $sponsor$
declare
 v jsonb:=current_setting('solaris.tg7_amendment_fixture')::jsonb;
 v_first jsonb;v_replay jsonb;
 v_amend uuid;
 v_projection jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'sponsor',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'sponsor','role','authenticated')::text,true);
 v_projection:=public.world_measure_amendments_manage_v1((v->>'measure')::uuid);
 if v_projection->>'canSubmit'<>'true' or
    v_projection->>'currentVersionId'<>v->>'version' then
  raise exception 'TG7_AMENDMENT_SCOPE_NOT_VERIFIED'; end if;
 begin
  perform public.world_submit_measure_amendment_v1(
   (v->>'measure')::uuid,(v->>'country')::uuid,(v->>'version')::uuid,
   'Missing text','New text','A legitimate reason',2,
   gen_random_uuid(),'tg7-bad-excerpt');
  raise exception 'TG7_AMENDMENT_NONEXISTENT_EXCERPT_ALLOWED';
 exception when invalid_parameter_value then null; end;
 v_first:=public.world_submit_measure_amendment_v1(
  (v->>'measure')::uuid,(v->>'country')::uuid,(v->>'version')::uuid,
  'Replace this exact passage','Better constitutional language',
  'An important procedural change',2,
  (v->>'submitOperation')::uuid,
  'world.amendment.submit:'||(v->>'submitOperation'));
 if v_first->>'status'<>'succeeded' or
    v_first #>> '{result,status}'<>'proposed' then
  raise exception 'TG7_SUBMISSION_RECEIPT_INVALID: %',v_first; end if;
 v_amend:=(v_first #>> '{result,amendmentId}')::uuid;
 perform set_config('solaris.tg7_amendment_id',v_amend::text,true);
 v_replay:=public.world_submit_measure_amendment_v1(
  (v->>'measure')::uuid,(v->>'country')::uuid,(v->>'version')::uuid,
  'Replace this exact passage','Better constitutional language',
  'An important procedural change',2,
  (v->>'submitOperation')::uuid,
  'world.amendment.submit:'||(v->>'submitOperation'));
 if v_replay->>'replayed'<>'true' or
    v_replay #>> '{result,amendmentId}'<>v_amend::text then
  raise exception 'TG7_AMENDMENT_REPLAY_CHANGED'; end if;
 if (select count(*) from public.world_measure_amendments
     where measure_id=(v->>'measure')::uuid)<>1 then
  raise exception 'TG7_AMENDMENT_DUPLICATED'; end if;
 if (select state from public.world_measures where id=(v->>'measure')::uuid)<>'registered'
   or (select full_text from public.world_measure_versions where id=(v->>'version')::uuid)
     <>'Opening paragraph. Replace this exact passage. Closing paragraph.' then
  raise exception 'TG7_AMENDMENT_MUTATED_CANONICAL_MEASURE'; end if;
end $sponsor$;

do $withdraw$
declare
 v jsonb:=current_setting('solaris.tg7_amendment_fixture')::jsonb;
 v_id uuid:=current_setting('solaris.tg7_amendment_id')::uuid;
 v_first jsonb;v_again jsonb;
begin
 v_first:=public.world_withdraw_measure_amendment_v1(
  v_id,1,(v->>'withdrawOperation')::uuid,
  'world.amendment.withdraw:'||(v->>'withdrawOperation'));
 if v_first->>'status'<>'succeeded' or
    v_first #>> '{result,status}'<>'withdrawn' then
  raise exception 'TG7_WITHDRAW_RECEIPT_INVALID: %',v_first; end if;
 v_again:=public.world_withdraw_measure_amendment_v1(
  v_id,1,(v->>'withdrawOperation')::uuid,
  'world.amendment.withdraw:'||(v->>'withdrawOperation'));
 if v_again->>'replayed'<>'true' then
  raise exception 'TG7_WITHDRAW_REPLAY_FAILED'; end if;
 if not exists(select 1 from public.world_measure_amendments
  where id=v_id and state='withdrawn' and revision=2
   and withdrawn_at is not null
   and current_text='Replace this exact passage') then
  raise exception 'TG7_WITHDRAW_DELETED_HISTORY'; end if;
end $withdraw$;
reset role;

set local role service_role;
do $direct$
begin
 begin
  update public.world_measure_amendments set state='accepted' where false;
  raise exception 'TG7_SERVICE_ROLE_CAN_DIRECTLY_ACCEPT_AMENDMENT';
 exception when insufficient_privilege then null; end;
end $direct$;
reset role;
rollback;
do $clean$
begin
 if exists(select 1 from auth.users where email like '%@tg7-amend.invalid')
 or exists(select 1 from public.world_organizations where slug like 'tg7-amend-%') then
  raise exception 'TG7_AMENDMENT_REHEARSAL_NOT_ROLLED_BACK'; end if;
 raise notice 'PASS: TG7 amendment sponsor, version, no adoption, CAS and rollback';
end $clean$;
