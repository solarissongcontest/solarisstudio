\set ON_ERROR_STOP on
-- WORLD-05 TG8 first half. Must be run with the companion checks SQL in
-- the SAME disposable local psql connection. Companion always ROLLBACKs.
begin;
do $fixture$
declare
  u_chair uuid:=gen_random_uuid();
  u_a uuid:=gen_random_uuid();
  u_b uuid:=gen_random_uuid();
  u_other uuid:=gen_random_uuid();
  p_chair uuid:=gen_random_uuid();
  p_a uuid:=gen_random_uuid();
  p_b uuid:=gen_random_uuid();
  c_a uuid:=gen_random_uuid();
  c_b uuid:=gen_random_uuid();
  org uuid:=gen_random_uuid();
  organ uuid:=gen_random_uuid();
  office uuid:=gen_random_uuid();
  rule uuid:=gen_random_uuid();
  measure uuid:=gen_random_uuid();
  version uuid:=gen_random_uuid();
  closed_measure uuid:=gen_random_uuid();
  closed_version uuid:=gen_random_uuid();
  closed_vote uuid:=gen_random_uuid();
begin
  if not exists(select 1 from public.studio2_feature_flags
       where key='terra_world_legislative_voting' and enabled=false) then
    raise exception 'TG8_ROLLOUT_WAS_NOT_DISABLED';
  end if;
  if to_regprocedure('public.world_open_vote_v1(uuid,bigint,uuid,timestamptz,uuid,text,uuid)') is null
    or to_regprocedure('public.world_cast_ballot_v1(uuid,uuid,bigint,text,uuid,text,uuid)') is null
    or to_regprocedure('public.world_certify_vote_v1(uuid,bigint,uuid,text,uuid)') is null
  then raise exception 'TG8_CANONICAL_RPC_MISSING'; end if;

  update public.studio2_feature_flags set enabled=true
    where key in ('terra_world_public','terra_world_voting_rules','terra_world_legislative_voting');
  update public.studio2_platform_operational_state
    set mode='normal',version=version+1 where singleton=true;
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (u_chair,'authenticated','authenticated',u_chair::text||'@tg8-legislative.invalid',now(),now()),
    (u_a,'authenticated','authenticated',u_a::text||'@tg8-legislative.invalid',now(),now()),
    (u_b,'authenticated','authenticated',u_b::text||'@tg8-legislative.invalid',now(),now()),
    (u_other,'authenticated','authenticated',u_other::text||'@tg8-legislative.invalid',now(),now());
  insert into public.delegation_people(id,display_name,identity_key) values
    (p_chair,'TG8 Test Chair','tg8:'||p_chair::text),
    (p_a,'TG8 Test Representative A','tg8:'||p_a::text),
    (p_b,'TG8 Test Representative B','tg8:'||p_b::text);
  insert into public.countries(id,name,short_code)
    values(c_a,'TG8 Test Country A','XZA'),(c_b,'TG8 Test Country B','XZB');
  insert into public.country_accounts(user_id,country_id,status)
    values(u_a,c_a,'active'),(u_b,c_b,'active');
  insert into public.world_organizations
    (id,slug,official_name,short_name,type,status,public_visibility)
  values(org,'tg8-legislative-'||replace(org::text,'-',''),
    'TG8 Test Organization','TG8 Test','international_organization','active','public');
  insert into public.world_organization_organs
    (id,organization_id,slug,name,status,visibility)
  values(organ,org,'assembly','TG8 Test Assembly','active','public');
  insert into public.world_organization_memberships
    (organization_id,country_id,membership_type,status,joined_at)
  values(org,c_a,'member','member',now()-interval '2 days'),
        (org,c_b,'member','member',now()-interval '2 days');
  insert into public.world_organization_representations
    (organization_id,country_id,person_id,user_id,role,voting_authority,source,starts_at)
  values(org,c_a,p_a,u_a,'representative',true,'tg8_local',now()-interval '2 days'),
        (org,c_b,p_b,u_b,'representative',true,'tg8_local',now()-interval '2 days');
  insert into public.world_organization_offices
    (id,organization_id,slug,title,office_type,appointment_method)
  values(office,org,'test-chair','TG8 Test Chair','executive_leader','appointment');
  insert into public.world_office_terms
    (office_id,holder_person_id,holder_user_id,started_at,term_kind,status)
  values(office,p_chair,u_chair,now()-interval '1 hour','appointed','active');
  insert into public.world_office_capabilities(office_id,capability)
    values(office,'world.vote.open'),(office,'world.vote.certify');
  insert into public.world_voting_rules
    (id,organization_id,key,label,ballot_type,secrecy,
     quorum_numerator,quorum_denominator,threshold_kind,
     threshold_numerator,threshold_denominator,denominator_policy,
     abstention_allowed,ballot_change_policy,publication_mode,tie_policy,revision)
  values(rule,org,'legislative','Exact two-thirds','recorded_roll_call','public',
    1,2,'fraction',2,3,'all_cast_including_abstentions',
    true,'locked_after_cast','after_certification','no_passage',1);
  insert into public.world_measures
    (id,organization_id,organ_id,identifier,measure_type,title,
     sponsor_country_id,state,visibility,registered_at)
  values(measure,org,organ,'TG8.2026.1.XZA.LEG.A','proposal','Open test measure',
    c_a,'registered','public',now()-interval '1 hour'),
        (closed_measure,org,organ,'TG8.2026.2.XZA.LEG.B','proposal',
         'Closed test measure',c_a,'voting','public',now()-interval '1 hour');
  insert into public.world_measure_versions
    (id,measure_id,version_number,title,full_text,content_hash,publication_state)
  values(version,measure,1,'Open test measure','Test proposal text',
         encode(sha256(convert_to('Test proposal text','UTF8')),'hex'),'published'),
        (closed_version,closed_measure,1,'Closed test measure','Closed proposal text',
         encode(sha256(convert_to('Closed proposal text','UTF8')),'hex'),'published');
  update public.world_measures set current_version_id=version where id=measure;
  update public.world_measures set current_version_id=closed_version where id=closed_measure;

  -- A trusted already-closed fixture permits certification testing without
  -- sleeping or altering the server clock or mutating a frozen vote.
  insert into public.world_votes
    (id,organization_id,organ_id,measure_id,measure_version_id,
     rule_id,rule_snapshot,electorate_count,opened_at,closes_at,open_operation_id)
  values(closed_vote,org,organ,closed_measure,closed_version,rule,
    private.world_voting_rule_snapshot_v1(rule),2,
    now()-interval '2 hours',now()-interval '1 hour',gen_random_uuid());
  insert into public.world_vote_electorate
    (vote_id,country_id,membership_id,membership_revision,
     representation_id,representation_revision,representative_person_id,captured_at)
  select closed_vote,m.country_id,m.id,m.revision,r.id,r.revision,r.person_id,
    now()-interval '2 hours'
  from public.world_organization_memberships m
  join public.world_organization_representations r
    on r.organization_id=m.organization_id and r.country_id=m.country_id
  where m.organization_id=org and m.status='member';
  insert into private.world_legislative_ballots
    (vote_id,country_id,choice,cast_by_user_id,operation_id)
  values(closed_vote,c_a,'aye',u_a,gen_random_uuid()),
        (closed_vote,c_b,'aye',u_b,gen_random_uuid());
  perform set_config('solaris.tg8_fixture',jsonb_build_object(
    'chair',u_chair,'repA',u_a,'repB',u_b,'outsider',u_other,'orgId',org,
    'orgSlug','tg8-legislative-'||replace(org::text,'-',''),
    'countryA',c_a,'measureId',measure,'ruleId',rule,
    'closedVoteId',closed_vote,
    'openOperationId',gen_random_uuid(),'certifyOperationId',gen_random_uuid()
  )::text,true);
  raise notice 'TG8 local fixture prepared inside rollback transaction';
end $fixture$;
