begin;

-- No browser SELECT on canonical electorates, ballots or certification tables.
-- These bounded read projections are the ONLY supported TG8 read contract.
-- They refuse pre-certification, private institution and withheld publication.

create or replace function public.world_vote_public_list_v1(
  p_organization_slug text default null,p_limit integer default 30
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $public_list$
  select case when coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
                 and (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
    then coalesce(jsonb_agg(jsonb_build_object(
      'id',items.id,'organizationSlug',items.slug,
      'measureId',items.measure_id,'measureTitle',items.title,
      'outcome',items.outcome,'ayeCount',items.aye_count,
      'nayCount',items.nay_count,'abstainCount',items.abstain_count,
      'eligibleElectorate',items.electorate_count,
      'resultHash',items.result_hash,'certifiedAt',items.certified_at
    ) order by items.certified_at desc,items.id),'[]'::jsonb)
    else '[]'::jsonb end
  from (
    select vote.id,org.slug,measure.id as measure_id,version.title,
      result.outcome,result.aye_count,result.nay_count,result.abstain_count,
      result.electorate_count,result.result_hash,result.certified_at
    from public.world_votes vote
    join public.world_vote_results result on result.vote_id=vote.id
    join public.world_organizations org on org.id=vote.organization_id
    join public.world_organization_organs organ on organ.id=vote.organ_id
    join public.world_measures measure on measure.id=vote.measure_id
    join public.world_measure_versions version on version.id=vote.measure_version_id
    where vote.status='certified' and org.public_visibility='public'
      and organ.visibility='public' and org.status in ('active','suspended','historical')
      and measure.visibility='public' and measure.registered_at is not null
      and version.publication_state='published'
      and vote.rule_snapshot->>'publicationMode'<>'withheld'
      and (p_organization_slug is null or org.slug=lower(btrim(p_organization_slug)))
    order by result.certified_at desc,vote.id
    limit greatest(1,least(coalesce(p_limit,30),50))
  ) items
$public_list$;

create or replace function public.world_vote_public_detail_v1(
  p_vote_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $public_detail$
  select case when
    coalesce(public.studio2_feature_enabled('terra_world_public',null),false)
    and (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
    then (
      select jsonb_build_object(
        'id',vote.id,'organizationSlug',org.slug,'organName',organ.name,
        'measureId',measure.id,'measureIdentifier',measure.identifier,
        'measureTitle',version.title,'measureVersionId',version.id,
        'certifiedAt',result.certified_at,'outcome',result.outcome,
        'ayeCount',result.aye_count,'nayCount',result.nay_count,
        'abstainCount',result.abstain_count,
        'eligibleElectorate',result.electorate_count,
        'castBallots',result.valid_ballot_count,
        'quorumMet',result.quorum_met,'thresholdMet',result.threshold_met,
        'resultHash',result.result_hash,
        'ruleKey',vote.rule_snapshot->>'ruleKey',
        'ruleRevision',vote.rule_snapshot->>'ruleRevision',
        'quorumNumerator',vote.rule_snapshot->>'quorumNumerator',
        'quorumDenominator',vote.rule_snapshot->>'quorumDenominator',
        'thresholdKind',vote.rule_snapshot->>'thresholdKind',
        'thresholdNumerator',vote.rule_snapshot->>'thresholdNumerator',
        'thresholdDenominator',vote.rule_snapshot->>'thresholdDenominator',
        'denominatorPolicy',vote.rule_snapshot->>'denominatorPolicy',
        'rollCall',case when vote.rule_snapshot->>'ballotType'='recorded_roll_call'
                    and vote.rule_snapshot->>'publicationMode'='after_certification'
                    then coalesce((
                      select jsonb_agg(jsonb_build_object(
                        'countryCode',country.short_code,'choice',ballot.choice
                      ) order by country.short_code)
                      from private.world_ballots ballot
                      join public.countries country on country.id=ballot.country_id
                      where ballot.vote_id=vote.id
                    ),'[]'::jsonb)
                    else '[]'::jsonb end
      )
      from public.world_votes vote
      join public.world_vote_results result on result.vote_id=vote.id
      join public.world_organizations org on org.id=vote.organization_id
      join public.world_organization_organs organ on organ.id=vote.organ_id
      join public.world_measures measure on measure.id=vote.measure_id
      join public.world_measure_versions version on version.id=vote.measure_version_id
      where vote.id=p_vote_id and vote.status='certified'
        and org.public_visibility='public' and organ.visibility='public'
        and measure.visibility='public' and measure.registered_at is not null
        and version.publication_state='published'
        and vote.rule_snapshot->>'publicationMode'<>'withheld'
      limit 1
    )
    else null end
$public_detail$;

-- A logged-in representative or frozen approved proxy sees ONLY their
-- authorized own-country ballot state. No private vote-open list leak.
create or replace function public.world_vote_my_ballot_v1(
  p_vote_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $own_ballot$
  select case when auth.uid() is null or
      not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
    then null
    else (
      select jsonb_build_object(
        'id',vote.id,'measureId',vote.measure_id,'status',vote.status,
        'revision',vote.revision,'openedAt',vote.opened_at,
        'closesAt',vote.closes_at,
        'ballotType',vote.rule_snapshot->>'ballotType',
        'ruleKey',vote.rule_snapshot->>'ruleKey',
        'quorumNumerator',vote.rule_snapshot->>'quorumNumerator',
        'quorumDenominator',vote.rule_snapshot->>'quorumDenominator',
        'thresholdKind',vote.rule_snapshot->>'thresholdKind',
        'thresholdNumerator',vote.rule_snapshot->>'thresholdNumerator',
        'thresholdDenominator',vote.rule_snapshot->>'thresholdDenominator',
        'countries',coalesce((
          select jsonb_agg(jsonb_build_object(
            'countryId',seat.country_id,'countryCode',country.short_code,
            'hasCast',ballot.vote_id is not null,'myChoice',ballot.choice,
            'canCast',vote.status='open' and now()>=vote.opened_at
               and now()<vote.closes_at and ballot.vote_id is null
          ) order by country.short_code)
          from public.world_vote_eligibility seat
          join public.countries country on country.id=seat.country_id
          left join private.world_ballots ballot
            on ballot.vote_id=seat.vote_id and ballot.country_id=seat.country_id
          where seat.vote_id=vote.id
            and private.world_vote_cast_authorized_v1(
              seat.vote_id,seat.country_id,auth.uid(),now())
        ),'[]'::jsonb)
      )
      from public.world_votes vote
      where vote.id=p_vote_id
        and exists (
          select 1 from public.world_vote_eligibility seat
          where seat.vote_id=vote.id
            and private.world_vote_cast_authorized_v1(
              seat.vote_id,seat.country_id,auth.uid(),now())
        )
      limit 1
    )
  end
$own_ballot$;

create or replace function public.world_vote_manage_v1(
  p_vote_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $vote_manage$
  select case when auth.uid() is null or
    not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
    then null else (
      select jsonb_build_object(
        'id',vote.id,'organizationId',vote.organization_id,
        'organId',vote.organ_id,'measureId',vote.measure_id,
        'ruleId',vote.rule_id,'ruleKey',vote.rule_snapshot->>'ruleKey',
        'status',vote.status,'revision',vote.revision,
        'openedAt',vote.opened_at,'closesAt',vote.closes_at,
        'eligibleElectorate',vote.electorate_count,
        'certifiedAt',vote.certified_at,
        'canCertify',public.world_access_allowed('world.vote.certify',
          vote.organization_id,null,vote.organ_id,null,null)
      )
      from public.world_votes vote
      where vote.id=p_vote_id and public.world_access_allowed(
        'world.vote.certify',vote.organization_id,null,vote.organ_id,null,null)
      limit 1
    )
  end
$vote_manage$;

create or replace function public.world_vote_openable_rules_v1(
  p_organization_id uuid,p_organ_id uuid default null
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $openable$
  select case when auth.uid() is null or
    not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
    or not public.world_access_allowed('world.vote.open',p_organization_id,null,p_organ_id,null,null)
    then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',rule_row.id,'key',rule_row.key,'label',rule_row.label,
        'ballotType',rule_row.ballot_type,'ruleRevision',rule_row.revision
      ) order by rule_row.key)
      from (
        select id,key,label,ballot_type,revision from public.world_voting_rules
        where organization_id=p_organization_id and active
          and ballot_type in ('recorded_roll_call','restricted_roll_call','aggregate_only')
        order by key limit 30
      ) rule_row
    ),'[]'::jsonb) end
$openable$;

create or replace function public.world_vote_openable_measures_v1(
  p_organization_id uuid
) returns jsonb language sql stable security definer set search_path=pg_catalog
as $openable_measures$
  select case when auth.uid() is null or
    not (coalesce(public.studio2_feature_enabled('terra_world_voting_rules',null),false)
       and coalesce(public.studio2_feature_enabled('terra_world_legislative_voting',null),false))
    then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'title',v.title,'identifier',m.identifier,
        'organizationId',m.organization_id,'organId',m.organ_id,
        'state',m.state,'revision',m.revision
      ) order by m.registered_at desc,m.id)
      from (
        select m.* from public.world_measures m
        join public.world_organization_organs organ on organ.id=m.organ_id
        where m.organization_id=p_organization_id
          and m.state in ('registered','scheduled','under_debate')
          and organ.status='active'
          and m.registered_at is not null
          and public.world_access_allowed('world.vote.open',
            m.organization_id,null,m.organ_id,null,null)
          and not exists(select 1 from public.world_votes vote
            where vote.measure_id=m.id and vote.status='open')
        order by m.registered_at desc,m.id
        limit 50
      ) m
      join public.world_measure_versions v on v.id=m.current_version_id
      where v.publication_state='published'
    ),'[]'::jsonb) end
$openable_measures$;

revoke all on function public.world_vote_openable_measures_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_vote_openable_measures_v1(uuid)
  to authenticated,service_role;

revoke all on function public.world_vote_public_list_v1(text,integer)
  from public,anon,authenticated;
grant execute on function public.world_vote_public_list_v1(text,integer)
  to anon,authenticated,service_role;
revoke all on function public.world_vote_public_detail_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_vote_public_detail_v1(uuid)
  to anon,authenticated,service_role;
revoke all on function public.world_vote_my_ballot_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_vote_my_ballot_v1(uuid)
  to authenticated,service_role;
revoke all on function public.world_vote_manage_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_vote_manage_v1(uuid)
  to authenticated,service_role;
revoke all on function public.world_vote_openable_rules_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.world_vote_openable_rules_v1(uuid,uuid)
  to authenticated,service_role;

commit;
