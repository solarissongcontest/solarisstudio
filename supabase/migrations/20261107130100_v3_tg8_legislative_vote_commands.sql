begin;

-- All consequential TG8 mutations reuse the R2 operation/receipt/event owner.
-- #2031 is the sole exact-rational math function. No client-authored policy
-- snapshot, no second representation owner, no hidden direct ballot writes.

create or replace function public.world_open_vote_v1(
  p_measure_id uuid,p_expected_measure_revision bigint,p_rule_id uuid,
  p_closes_at timestamptz,p_operation_id uuid,p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $open_vote$
declare
  v_measure public.world_measures%rowtype;
  v_rule public.world_voting_rules%rowtype;
  v_snap jsonb;
  v_at timestamptz := clock_timestamp();
  v_member_count bigint;
  v_represented_count bigint;
  v_vote_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null or p_measure_id is null or p_rule_id is null
     or p_expected_measure_revision is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
     or not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
  then raise exception using errcode='25006',message='VOTING_NOT_AVAILABLE'; end if;
  if p_closes_at is null or p_closes_at < v_at + interval '1 minute'
     or p_closes_at > v_at + interval '90 days'
  then raise exception using errcode='22023',message='INVALID_VOTE_WINDOW'; end if;

  -- The formal measure is the one canonical subject. No generic string ID or
  -- caller-selected organization is trusted.
  select * into v_measure from public.world_measures
  where id=p_measure_id for update;
  if v_measure.id is null or not public.world_access_allowed(
     'world.vote.open',v_measure.organization_id,
     null,v_measure.organ_id,null,null)
  then raise exception using errcode='42501',message='VOTE_OPEN_NOT_AUTHORIZED'; end if;

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.vote.open','R2',
    jsonb_build_object('subjectType','world_measure','measureId',p_measure_id,
      'organizationId',v_measure.organization_id,'organId',v_measure.organ_id),
    jsonb_build_object('ruleId',p_rule_id,'closesAt',p_closes_at,
      'expectedMeasureRevision',p_expected_measure_revision)
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
  end if;

  if v_measure.revision<>p_expected_measure_revision
     or v_measure.state not in ('registered','scheduled','under_debate')
     or v_measure.registered_at is null
  then raise exception using errcode='40001',message='MEASURE_VERSION_OR_STATE_CHANGED'; end if;
  if exists(select 1 from public.world_votes
      where measure_id=p_measure_id and status='open')
  then raise exception using errcode='23505',message='ALREADY_OPEN'; end if;
  if not exists (
     select 1 from public.world_measure_versions version_row
     where version_row.id=v_measure.current_version_id
       and version_row.measure_id=v_measure.id
       and version_row.publication_state='published'
  ) then raise exception using errcode='23514',message='UNPUBLISHED_MEASURE_VERSION'; end if;
  perform 1 from public.world_organizations org
    join public.world_organization_organs organ
      on organ.organization_id=org.id
    where org.id=v_measure.organization_id
      and organ.id=v_measure.organ_id
      and org.status='active' and organ.status='active'
    for share of org,organ;
  if not found then raise exception using errcode='23514',message='INACTIVE_INSTITUTION'; end if;

  select * into v_rule from public.world_voting_rules
  where id=p_rule_id and organization_id=v_measure.organization_id
    and active for share;
  if v_rule.id is null or
     v_rule.ballot_type not in ('recorded_roll_call','restricted_roll_call','aggregate_only')
     or v_rule.secrecy='secret'
     or v_rule.denominator_policy<>'all_cast_including_abstentions'
     or v_rule.ballot_change_policy<>'locked_after_cast'
  then raise exception using errcode='22023',message='UNSUPPORTED_LEGISLATIVE_RULE'; end if;
  v_snap:=private.world_voting_rule_snapshot_v1(v_rule.id);
  if v_snap is null or (v_snap->>'ruleId')::uuid<>v_rule.id
     or (v_snap->>'organizationId')::uuid<>v_measure.organization_id
  then raise exception using errcode='23514',message='RULE_SNAPSHOT_UNAVAILABLE'; end if;

  -- Membership/representation/proxy commands can insert as well as update.
  -- A narrow snapshot transaction must exclude those inserts, not only lock
  -- current rows. Replace these short-lived table locks only after TG5/TG6
  -- agree and enforce a shared organization-scoped mutation lock.
  lock table public.world_organization_memberships in share mode;
  lock table public.world_organization_representations in share mode;
  lock table public.world_representation_proxies in share mode;
  v_at:=clock_timestamp();
  if p_closes_at < v_at + interval '1 minute' then
    raise exception using errcode='22023',message='VOTE_WINDOW_EXPIRED_DURING_OPEN';
  end if;

  select count(*) into v_member_count
  from public.world_organization_memberships m
  where m.organization_id=v_measure.organization_id and m.status='member'
    and m.joined_at<=v_at and m.ended_at is null;
  select count(*) into v_represented_count
  from public.world_organization_memberships m
  join public.world_organization_representations rep
    on rep.organization_id=m.organization_id and rep.country_id=m.country_id
   and rep.role='representative' and rep.voting_authority
   and rep.starts_at<=v_at and rep.ends_at is null
  where m.organization_id=v_measure.organization_id and m.status='member'
    and m.joined_at<=v_at and m.ended_at is null;
  if v_member_count<1 or v_member_count>200 or v_member_count<>v_represented_count then
    raise exception using errcode='23514',message='INCOMPLETE_OR_AMBIGUOUS_ELECTORATE';
  end if;
  -- For the first supported non-session legislative votes, only approved
  -- organisation-wide proxies (session_id IS NULL) are eligible. No session
  -- proxy can become a general vote proxy through accidental omission.
  if exists (
    select 1
    from public.world_organization_representations rep
    join public.world_representation_proxies p on p.representation_id=rep.id
    join public.world_organization_memberships m
      on m.organization_id=rep.organization_id and m.country_id=rep.country_id
    where rep.organization_id=v_measure.organization_id
      and rep.role='representative' and rep.voting_authority
      and rep.starts_at<=v_at and rep.ends_at is null
      and m.status='member' and m.ended_at is null and m.joined_at<=v_at
      and p.session_id is null and p.status='approved'
      and p.revoked_at is null and p.valid_from<=v_at and p.valid_until>v_at
    group by rep.id having count(*)>1
  ) then raise exception using errcode='23514',message='AMBIGUOUS_ACTIVE_PROXY'; end if;

  insert into public.world_votes(
    organization_id,organ_id,measure_id,measure_version_id,rule_id,
    rule_snapshot,electorate_count,opened_at,closes_at,open_operation_id
  ) values (
    v_measure.organization_id,v_measure.organ_id,v_measure.id,
    v_measure.current_version_id,v_rule.id,v_snap,v_member_count,
    v_at,p_closes_at,v_operation_id
  ) returning id into v_vote_id;

  insert into public.world_vote_electorate(
    vote_id,country_id,membership_id,membership_revision,
    representation_id,representation_revision,representative_person_id,
    proxy_id,proxy_revision,captured_at
  )
  select v_vote_id,m.country_id,m.id,m.revision,rep.id,rep.revision,rep.person_id,
    proxy.id,proxy.revision,v_at
  from public.world_organization_memberships m
  join public.world_organization_representations rep
    on rep.organization_id=m.organization_id and rep.country_id=m.country_id
   and rep.role='representative' and rep.voting_authority
   and rep.starts_at<=v_at and rep.ends_at is null
  left join public.world_representation_proxies proxy
    on proxy.representation_id=rep.id and proxy.session_id is null
   and proxy.status='approved' and proxy.revoked_at is null
   and proxy.valid_from<=v_at and proxy.valid_until>v_at
  where m.organization_id=v_measure.organization_id
    and m.status='member' and m.joined_at<=v_at and m.ended_at is null;
  if (select count(*) from public.world_vote_electorate where vote_id=v_vote_id)
      <>v_member_count then
    raise exception using errcode='23514',message='ELECTORATE_SNAPSHOT_INCONSISTENT';
  end if;
  update public.world_measures
     set state='voting',revision=revision+1
   where id=v_measure.id and revision=p_expected_measure_revision;

  perform private.v3_emit_domain_event(
    'world.vote.opened','world_vote',v_vote_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('voteId',v_vote_id,'measureId',v_measure.id,
      'organizationId',v_measure.organization_id,'electorateCount',v_member_count),
    1,array[]::text[]
  );
  v_result:=jsonb_build_object('ok',true,'voteId',v_vote_id,'measureId',v_measure.id,
    'status','open','revision',1,'electorateCount',v_member_count,
    'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    ||jsonb_build_object('replayed',false);
end $open_vote$;

-- Proof of current actor validity uses BOTH frozen membership/representation
-- identity and today's institutional authority. An expired/revoked proxy,
-- suspended country, or changed representative cannot submit an old ballot.
create or replace function private.world_vote_cast_authorized_v1(
  p_vote_id uuid,p_country_id uuid,p_actor uuid,p_at timestamptz
) returns boolean language sql stable security definer set search_path=pg_catalog
as $actor$
  select exists(
    select 1 from public.world_vote_electorate seat
    join public.world_votes vote on vote.id=seat.vote_id
    join public.world_organization_memberships membership
      on membership.id=seat.membership_id
    join public.world_organization_representations representation
      on representation.id=seat.representation_id
    left join public.world_representation_proxies proxy
      on proxy.id=seat.proxy_id
    where seat.vote_id=p_vote_id and seat.country_id=p_country_id
      and vote.organization_id=membership.organization_id
      and vote.organization_id=representation.organization_id
      and membership.country_id=seat.country_id
      and representation.country_id=seat.country_id
      and membership.status='member' and membership.ended_at is null
      and membership.joined_at<=p_at and membership.revision=seat.membership_revision
      and representation.role='representative'
      and representation.voting_authority and representation.ends_at is null
      and representation.starts_at<=p_at
      and representation.revision=seat.representation_revision
      and representation.person_id=seat.representative_person_id
      and (
        (seat.proxy_id is null and representation.user_id=p_actor)
        or (seat.proxy_id is not null and proxy.id=seat.proxy_id
          and proxy.representation_id=seat.representation_id
          and proxy.revision=seat.proxy_revision
          and proxy.proxy_user_id=p_actor and proxy.session_id is null
          and proxy.status='approved' and proxy.revoked_at is null
          and proxy.valid_from<=p_at and p_at<proxy.valid_until)
      )
  )
$actor$;
revoke all on function private.world_vote_cast_authorized_v1(uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.world_cast_ballot_v1(
  p_vote_id uuid,p_country_id uuid,p_expected_vote_revision bigint,p_choice text,
  p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $cast_vote$
declare
  v_vote public.world_votes%rowtype;
  v_seat public.world_vote_electorate%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_at timestamptz:=clock_timestamp();
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or p_vote_id is null or p_country_id is null or p_operation_id is null
     or p_expected_vote_revision is null
     or p_choice not in ('aye','nay','abstain') or p_choice is null
     or not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
  then raise exception using errcode='25006',message='BALLOT_UNAVAILABLE'; end if;

  -- Shared lock allows parallel country submissions but blocks certification.
  select * into v_vote from public.world_votes where id=p_vote_id for share;
  if v_vote.id is null then raise exception using errcode='42501',message='BALLOT_UNAVAILABLE'; end if;
  select * into v_seat from public.world_vote_electorate
  where vote_id=p_vote_id and country_id=p_country_id;
  if v_seat.vote_id is null then
    raise exception using errcode='42501',message='NOT_ELIGIBLE';
  end if;
  -- The same current representation/membership/proxy rows used by the
  -- predicate are held against revocation until this ballot transaction ends.
  perform 1 from public.world_organization_memberships membership
    join public.world_organization_representations rep
      on rep.id=v_seat.representation_id
   where membership.id=v_seat.membership_id
     for share of membership,rep;
  if not found then raise exception using errcode='42501',message='NOT_ELIGIBLE'; end if;
  if v_seat.proxy_id is not null then
    perform 1 from public.world_representation_proxies proxy
      where proxy.id=v_seat.proxy_id for share;
    if not found then raise exception using errcode='42501',message='NOT_ELIGIBLE'; end if;
  end if;
  if v_seat.vote_id is null or not private.world_vote_cast_authorized_v1(
     p_vote_id,v_seat.country_id,v_actor,v_at)
  then raise exception using errcode='42501',message='NOT_ELIGIBLE'; end if;

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.vote.ballot_cast','R2',
    jsonb_build_object('subjectType','world_vote','voteId',p_vote_id,
      'countryId',p_country_id,'organizationId',v_vote.organization_id),
    jsonb_build_object('choice',p_choice,'expectedVoteRevision',p_expected_vote_revision)
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
  end if;

  if v_vote.status<>'open' or v_vote.revision<>p_expected_vote_revision
     or v_at<v_vote.opened_at or v_at>=v_vote.closes_at
  then raise exception using errcode='40001',message='VOTE_CLOSED_OR_CHANGED'; end if;
  if exists(select 1 from private.world_legislative_ballots
      where vote_id=p_vote_id and country_id=v_seat.country_id)
  then raise exception using errcode='23505',message='BALLOT_ALREADY_CAST'; end if;

  insert into private.world_legislative_ballots(
    vote_id,country_id,choice,cast_by_user_id,cast_by_proxy_id,operation_id,cast_at
  ) values(p_vote_id,v_seat.country_id,p_choice,v_actor,v_seat.proxy_id,v_operation_id,v_at);

  -- The event must not contain the choice, private login ID or proxy identity.
  perform private.v3_emit_domain_event(
    'world.vote.ballot_cast','world_vote',p_vote_id::text,1,
    v_operation_id,null,null,jsonb_build_object('voteId',p_vote_id),
    1,array[]::text[]
  );
  v_result:=jsonb_build_object('ok',true,'voteId',p_vote_id,
    'status','cast','revision',v_vote.revision,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    ||jsonb_build_object('replayed',false);
end $cast_vote$;

create or replace function public.world_certify_vote_v1(
  p_vote_id uuid,p_expected_vote_revision bigint,
  p_operation_id uuid,p_idempotency_key text,p_correlation_id uuid default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog
as $certify_vote$
declare
  v_vote public.world_votes%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_counts record;
  v_tally jsonb;
  v_at timestamptz:=clock_timestamp();
  v_hash text;
  v_measure public.world_measures%rowtype;
begin
  if auth.uid() is null or p_vote_id is null or p_expected_vote_revision is null
     or p_operation_id is null
     or not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
  then raise exception using errcode='25006',message='CERTIFICATION_UNAVAILABLE'; end if;
  select * into v_vote from public.world_votes where id=p_vote_id for update;
  if v_vote.id is null or not public.world_access_allowed(
    'world.vote.certify',v_vote.organization_id,
    null,v_vote.organ_id,null,null)
  then raise exception using errcode='42501',message='CERTIFICATION_AUTHORIZATION'; end if;

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.vote.certify','R3',
    jsonb_build_object('subjectType','world_vote','voteId',p_vote_id,
      'organizationId',v_vote.organization_id,'measureId',v_vote.measure_id),
    jsonb_build_object('expectedVoteRevision',p_expected_vote_revision)
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
  end if;
  if v_vote.status<>'open' or v_vote.revision<>p_expected_vote_revision
     or v_at<v_vote.closes_at
  then raise exception using errcode='40001',message='VOTE_NOT_CLOSED_OR_CHANGED'; end if;
  if (select count(*) from public.world_vote_electorate where vote_id=p_vote_id)
      <> v_vote.electorate_count
  then raise exception using errcode='23514',message='FROZEN_ELECTORATE_TAMPERED'; end if;

  select count(*)::bigint as total,
    count(*) filter(where choice='aye')::bigint as aye,
    count(*) filter(where choice='nay')::bigint as nay,
    count(*) filter(where choice='abstain')::bigint as abstain
    into v_counts from private.world_legislative_ballots
  where vote_id=p_vote_id;

  v_tally:=private.world_legislative_tally_v1(
    v_counts.aye,v_counts.nay,v_counts.abstain,v_vote.electorate_count,
    (v_vote.rule_snapshot->>'quorumNumerator')::bigint,
    (v_vote.rule_snapshot->>'quorumDenominator')::bigint,
    v_vote.rule_snapshot->>'thresholdKind',
    (v_vote.rule_snapshot->>'thresholdNumerator')::bigint,
    (v_vote.rule_snapshot->>'thresholdDenominator')::bigint,
    v_vote.rule_snapshot->>'denominatorPolicy'
  );
  v_result:=jsonb_build_object('voteId',p_vote_id,'measureId',v_vote.measure_id,
    'organizationId',v_vote.organization_id,'electorateCount',v_vote.electorate_count,
    'validBallotCount',v_counts.total,'ayeCount',v_counts.aye,
    'nayCount',v_counts.nay,'abstainCount',v_counts.abstain,
    'quorumMet',v_tally->'quorumMet',
    'thresholdMet',v_tally->'thresholdMet','outcome',v_tally->'outcome',
    'ruleSnapshot',v_vote.rule_snapshot,
    'certifiedAt',to_jsonb(v_at));
  v_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(
    v_result::text,'UTF8')),'hex');

  insert into public.world_vote_results(
    vote_id,organization_id,measure_id,result_snapshot,rule_snapshot,
    electorate_count,valid_ballot_count,aye_count,nay_count,abstain_count,
    quorum_met,threshold_met,outcome,certified_by,certified_at,
    certification_operation_id,result_hash
  ) values(p_vote_id,v_vote.organization_id,v_vote.measure_id,v_result,
    v_vote.rule_snapshot,v_vote.electorate_count,v_counts.total,
    v_counts.aye,v_counts.nay,v_counts.abstain,
    (v_tally->>'quorumMet')::boolean,(v_tally->>'thresholdMet')::boolean,
    v_tally->>'outcome',auth.uid(),v_at,v_operation_id,v_hash);

  update public.world_votes set status='certified',revision=revision+1,
    certified_at=v_at,certified_by=auth.uid()
    where id=p_vote_id;
  -- Subject mutation is canonical to TG7 and only follows the certified
  -- result. A quorum failure is NOT a legislative rejection.
  select * into v_measure from public.world_measures
    where id=v_vote.measure_id for update;
  if v_measure.id is null or v_measure.state<>'voting'
     or v_measure.current_version_id<>v_vote.measure_version_id
  then raise exception using errcode='23514',message='MEASURE_STATE_CHANGED'; end if;
  update public.world_measures set
    state=case when v_tally->>'outcome'='passed' then 'adopted'
      when v_tally->>'outcome'='failed' then 'rejected'
      else 'under_debate' end,
    concluded_at=case when v_tally->>'outcome'='no_quorum'
      then null else v_at end,
    revision=revision+1
    where id=v_vote.measure_id;

  perform private.v3_emit_domain_event(
    'world.vote.certified','world_vote',p_vote_id::text,v_vote.revision+1,
    v_operation_id,null,null,
    jsonb_build_object('voteId',p_vote_id,'measureId',v_vote.measure_id,
      'organizationId',v_vote.organization_id,'resultHash',v_hash,
      'outcome',v_tally->>'outcome'),
    1,array[]::text[]
  );
  v_result:=jsonb_build_object('ok',true,'voteId',p_vote_id,'measureId',v_vote.measure_id,
    'status','certified','revision',v_vote.revision+1,'outcome',v_tally->>'outcome',
    'resultHash',v_hash,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    ||jsonb_build_object('replayed',false);
end $certify_vote$;

revoke all on function public.world_open_vote_v1(uuid,bigint,uuid,timestamptz,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.world_open_vote_v1(uuid,bigint,uuid,timestamptz,uuid,text,uuid)
  to authenticated,service_role;
revoke all on function public.world_cast_ballot_v1(uuid,uuid,bigint,text,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.world_cast_ballot_v1(uuid,uuid,bigint,text,uuid,text,uuid)
  to authenticated,service_role;
revoke all on function public.world_certify_vote_v1(uuid,bigint,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.world_certify_vote_v1(uuid,bigint,uuid,text,uuid)
  to authenticated,service_role;

commit;
