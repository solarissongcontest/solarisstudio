\set ON_ERROR_STOP on
-- TG8 rule configuration, identity and immutable history: local rollback only.
begin;

do $fixture$
declare
  v_manager uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_private_org uuid := gen_random_uuid();
  v_office uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (v_manager,'authenticated','authenticated',v_manager::text || '@tg8-rule.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text || '@tg8-rule.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key)
  values(v_person,'TG8 Rule Manager','tg8-rule:' || v_person::text);
  insert into public.world_organizations(
    id,slug,official_name,short_name,type,status,public_visibility
  ) values
    (v_org,'tg8-rules-' || replace(v_org::text,'-',''),
      'TG8 Published Organization','TG8 Published','international_organization','active','public'),
    (v_private_org,'tg8-rules-' || replace(v_private_org::text,'-',''),
      'TG8 Private Organization','TG8 Private','international_organization','active','private');
  insert into public.world_organization_offices(
    id,organization_id,slug,title,office_type,appointment_method
  ) values
    (v_office,v_org,'policy-manager','TG8 Policy Manager',
      'executive_leader','appointment');
  insert into public.world_office_terms(
    office_id,holder_person_id,holder_user_id,started_at,term_kind,status
  ) values
    (v_office,v_person,v_manager,now(),'appointed','active');
  insert into public.world_office_capabilities(office_id,capability)
  values (v_office,'world.organization.settings.manage');

  -- This trusted test fixture exists solely to prove that a private
  -- organization policy is NOT published by the SECURITY DEFINER projection.
  insert into public.world_voting_rules(
    organization_id,key,label,ballot_type,secrecy,
    quorum_numerator,quorum_denominator,
    threshold_kind,threshold_numerator,threshold_denominator,
    denominator_policy,abstention_allowed,ballot_change_policy,
    publication_mode,tie_policy,revision
  ) values (
    v_private_org,'legislative','Private voting rules',
    'recorded_roll_call','public',
    1,2,'simple_majority',null,null,
    'all_cast_including_abstentions',true,'locked_after_cast',
    'after_certification','no_passage',1
  );

  perform set_config('solaris.tg8_rule_fixture',jsonb_build_object(
    'manager',v_manager,'outsider',v_outsider,
    'organizationId',v_org,'privateOrganizationId',v_private_org,
    'organizationSlug','tg8-rules-' || replace(v_org::text,'-',''),
    'privateSlug','tg8-rules-' || replace(v_private_org::text,'-',''),
    'firstOperationId',gen_random_uuid()
  )::text,true);
end
$fixture$;

set local role anon;
set local request.jwt.claim.role = 'anon';
set local request.jwt.claim.sub = '';
do $anon$
declare
  v jsonb := current_setting('solaris.tg8_rule_fixture')::jsonb;
begin
  if public.world_public_voting_rule_v1(v->>'privateSlug','legislative') is not null then
    raise exception 'TG8_PRIVATE_ORGANIZATION_RULE_PUBLIC_LEAK';
  end if;
  begin
    perform public.world_configure_voting_rule_v1(
      (v->>'organizationId')::uuid,'legislative','TG8 rule',
      'recorded_roll_call','public',1,2,'fraction',2,3,
      'all_cast_including_abstentions',true,'locked_after_cast',
      'after_certification','no_passage',0,
      gen_random_uuid(),'tg8-anon:' || gen_random_uuid()::text
    );
    raise exception 'TG8_ANON_RULE_CONFIGURATION_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
do $outsider$
declare
  v jsonb := current_setting('solaris.tg8_rule_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  begin
    perform public.world_configure_voting_rule_v1(
      (v->>'organizationId')::uuid,'legislative','TG8 rule',
      'recorded_roll_call','public',1,2,'fraction',2,3,
      'all_cast_including_abstentions',true,'locked_after_cast',
      'after_certification','no_passage',0,
      gen_random_uuid(),'tg8-outsider:' || gen_random_uuid()::text
    );
    raise exception 'TG8_UNAUTHORIZED_RULE_CONFIGURATION_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.world_voting_rules;
    raise exception 'TG8_AUTHENTICATED_RAW_RULE_SELECT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$outsider$;

do $manager$
declare
  v jsonb := current_setting('solaris.tg8_rule_fixture')::jsonb;
  v_first jsonb;
  v_replayed jsonb;
  v_second jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'manager',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'manager','role','authenticated')::text,true);
  v_first := public.world_configure_voting_rule_v1(
    (v->>'organizationId')::uuid,'legislative','TG8 2/3 legislative',
    'recorded_roll_call','public',1,2,'fraction',2,3,
    'all_cast_including_abstentions',true,'locked_after_cast',
    'after_certification','no_passage',0,
    (v->>'firstOperationId')::uuid,'tg8-rule:' || (v->>'firstOperationId')
  );
  if v_first->>'status' <> 'succeeded'
     or v_first #>> '{result,revision}' <> '1'
  then raise exception 'TG8_RULE_INITIAL_RECEIPT_INVALID'; end if;

  v_replayed := public.world_configure_voting_rule_v1(
    (v->>'organizationId')::uuid,'legislative','TG8 2/3 legislative',
    'recorded_roll_call','public',1,2,'fraction',2,3,
    'all_cast_including_abstentions',true,'locked_after_cast',
    'after_certification','no_passage',0,
    (v->>'firstOperationId')::uuid,'tg8-rule:' || (v->>'firstOperationId')
  );
  if coalesce((v_replayed->>'replayed')::boolean,false) is not true
     or v_replayed #>> '{result,revision}' <> '1'
  then raise exception 'TG8_RULE_RECEIPT_REPLAY_UNSTABLE'; end if;

  begin
    perform public.world_configure_voting_rule_v1(
      (v->>'organizationId')::uuid,'legislative','TG8 stale request',
      'recorded_roll_call','public',1,2,'fraction',3,4,
      'all_cast_including_abstentions',true,'locked_after_cast',
      'after_certification','no_passage',0,
      gen_random_uuid(),'tg8-stale:' || gen_random_uuid()::text
    );
    raise exception 'TG8_STALE_RULE_REVISION_ALLOWED';
  exception when serialization_failure then null;
  end;

  begin
    perform public.world_configure_voting_rule_v1(
      (v->>'organizationId')::uuid,'legislative','TG8 unsafe denominator',
      'recorded_roll_call','public',1,2,'fraction',2,3,
      'present_and_voting',true,'locked_after_cast',
      'after_certification','no_passage',1,
      gen_random_uuid(),'tg8-bad-denominator:' || gen_random_uuid()::text
    );
    raise exception 'TG8_SILENT_ABSTENTION_EXCLUSION_ALLOWED';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.world_configure_voting_rule_v1(
      (v->>'organizationId')::uuid,'legislative','TG8 incomplete threshold',
      'recorded_roll_call','public',1,2,'fraction',null,null,
      'all_cast_including_abstentions',true,'locked_after_cast',
      'after_certification','no_passage',1,
      gen_random_uuid(),'tg8-bad-threshold:' || gen_random_uuid()::text
    );
    raise exception 'TG8_INCOMPLETE_THRESHOLD_ALLOWED';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.world_configure_voting_rule_v1(
      (v->>'organizationId')::uuid,'secret-election','TG8 secret election',
      'secret_election','secret',1,2,'simple_majority',null,null,
      'all_cast_including_abstentions',true,'locked_after_cast',
      'withheld','manual_review',0,
      gen_random_uuid(),'tg8-secret:' || gen_random_uuid()::text
    );
    raise exception 'TG8_UNIMPLEMENTED_SECRET_ELECTION_CONFIG_ALLOWED';
  exception when invalid_parameter_value then null;
  end;

  v_second := public.world_configure_voting_rule_v1(
    (v->>'organizationId')::uuid,'legislative','TG8 3/4 legislative',
    'recorded_roll_call','public',1,2,'fraction',3,4,
    'all_cast_including_abstentions',true,'locked_after_cast',
    'after_certification','no_passage',1,
    gen_random_uuid(),'tg8-revise:' || gen_random_uuid()::text
  );
  if v_second #>> '{result,revision}' <> '2'
  then raise exception 'TG8_RULE_REVISION_TWO_RECEIPT_INVALID'; end if;
end
$manager$;
reset role;

do $verify$
declare
  v jsonb := current_setting('solaris.tg8_rule_fixture')::jsonb;
  v_old public.world_voting_rules%rowtype;
  v_new public.world_voting_rules%rowtype;
  v_snapshot jsonb;
begin
  select * into v_old from public.world_voting_rules
  where organization_id=(v->>'organizationId')::uuid
    and key='legislative' and revision=1;
  select * into v_new from public.world_voting_rules
  where organization_id=(v->>'organizationId')::uuid
    and key='legislative' and revision=2;

  if v_old.id is null or v_old.active or v_old.superseded_at is null
     or v_old.threshold_numerator <> 2 or v_old.threshold_denominator <> 3
     or v_new.id is null or not v_new.active
     or v_new.threshold_numerator <> 3 or v_new.threshold_denominator <> 4
  then raise exception 'TG8_VOTING_RULE_HISTORY_NOT_PRESERVED'; end if;

  if private.world_voting_rule_snapshot_v1(v_old.id) is not null then
    raise exception 'TG8_SUPERSEDED_RULE_SNAPSHOT_ALLOWED';
  end if;
  v_snapshot := private.world_voting_rule_snapshot_v1(v_new.id);
  if v_snapshot->>'ruleId' <> v_new.id::text
     or v_snapshot->>'ruleRevision' <> '2'
     or v_snapshot->>'denominatorPolicy' <> 'all_cast_including_abstentions'
     or v_snapshot->>'quorumNumerator' <> '1'
     or v_snapshot->>'quorumDenominator' <> '2'
     or v_snapshot->>'thresholdNumerator' <> '3'
     or v_snapshot->>'thresholdDenominator' <> '4'
  then raise exception 'TG8_RULE_SNAPSHOT_NOT_CANONICAL'; end if;

  begin
    update public.world_voting_rules set threshold_numerator=1
    where id=v_old.id;
    raise exception 'TG8_IMMUTABLE_RULE_HISTORY_UPDATE_ALLOWED';
  exception when check_violation then null;
  end;
  begin
    delete from public.world_voting_rules where id=v_old.id;
    raise exception 'TG8_IMMUTABLE_RULE_HISTORY_DELETE_ALLOWED';
  exception when check_violation then null;
  end;
  raise notice 'PASS: rule revisions are immutable; only active exact rule snapshots can be frozen';
end
$verify$;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $public$
declare
  v jsonb := current_setting('solaris.tg8_rule_fixture')::jsonb;
  v_policy jsonb;
begin
  v_policy := public.world_public_voting_rule_v1(v->>'organizationSlug','legislative');
  if v_policy->>'thresholdNumerator' <> '3'
     or v_policy->>'thresholdDenominator' <> '4'
     or v_policy->>'quorumNumerator' <> '1'
     or v_policy->>'quorumDenominator' <> '2'
     or v_policy->>'denominatorPolicy' <> 'all_cast_including_abstentions'
  then
    raise exception 'TG8_PUBLIC_RULE_EXACT_FRACTION_PROJECTION_LOST';
  end if;
  if public.world_public_voting_rule_v1(v->>'privateSlug','legislative') is not null then
    raise exception 'TG8_PRIVATE_VOTING_RULE_PUBLICATION_LEAK';
  end if;
  begin
    perform private.world_voting_rule_snapshot_v1(
      (select id from public.world_voting_rules limit 1)
    );
    raise exception 'TG8_PRIVATE_SNAPSHOT_EXECUTABLE_BY_ANON';
  exception when insufficient_privilege then null;
  end;
end
$public$;
reset role;
rollback;

do $rolled_back$
begin
  if exists (select 1 from auth.users where email like '%@tg8-rule.invalid')
     or exists (select 1 from public.world_organizations where slug like 'tg8-rules-%')
  then raise exception 'TG8_VOTING_RULE_REHEARSAL_NOT_ROLLED_BACK'; end if;
  raise notice 'PASS: TG8 policy configuration, exact public fractions, authority, history, snapshot, receipt and rollback';
end
$rolled_back$;
