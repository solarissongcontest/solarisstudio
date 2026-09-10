create or replace function public.friend_voting_historical_country_payload(
  p_channel text default 'combined',
  p_edition_id uuid default null,
  p_limit integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = public, televoting, pg_temp
as $$
declare
  result_payload jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or not public.has_role(auth.uid(), 'organizer'::public.app_role)) then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  if p_channel not in ('combined', 'jury', 'televote') then
    raise exception 'Invalid friend-voting evidence channel' using errcode = '22023';
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 250), 750));

  with remote_editions as materialized (
    select remote_id::text as remote_edition_id, solaris_id::uuid as edition_id
    from public.integration_links
    where service = 'televoting' and entity_type = 'edition'
  ),
  round_map as materialized (
    select r.id as round_id, coalesce(b.edition_id, re.edition_id) as edition_id
    from televoting.rounds r
    left join public.televoting_round_bindings b on b.remote_round_id = r.id::text
    left join remote_editions re on re.remote_edition_id = r.edition_id::text
  ),
  scoped_submissions as materialized (
    select
      s.id,
      s.round_id,
      upper(s.country_code) as country_code,
      s.username,
      s.username_normalized,
      coalesce(s.is_vpn, false) as is_vpn,
      coalesce(s.risk_score, 0)::integer as risk_score,
      s.status,
      s.created_at,
      rm.edition_id
    from televoting.vote_submissions s
    join round_map rm on rm.round_id = s.round_id and rm.edition_id is not null
    where coalesce(s.status, '') <> 'deleted'
      and (p_edition_id is null or rm.edition_id = p_edition_id)
  ),
  vote_entry_scores as materialized (
    select submission_id, upper(target_country_code) as target_code, max(points)::numeric as points
    from televoting.vote_entries
    group by submission_id, upper(target_country_code)
  ),
  round_targets as materialized (
    select distinct
      round_id,
      upper(coalesce(nullif(country_code, ''), nullif(entry_key, ''))) as target_code
    from televoting.round_entries
    where coalesce(nullif(country_code, ''), nullif(entry_key, '')) is not null
  ),
  tv_base as (
    select
      s.id::text as ballot_id,
      s.edition_id,
      'televote'::text as channel,
      s.country_code as voter_code,
      rt.target_code,
      coalesce(ves.points, 0)::numeric as score
    from scoped_submissions s
    join round_targets rt
      on rt.round_id = s.round_id
     and rt.target_code <> s.country_code
    left join vote_entry_scores ves
      on ves.submission_id = s.id
     and ves.target_code = rt.target_code
    where p_channel in ('combined', 'televote')
  ),
  tv_observations as (
    select *, max(score) over (partition by ballot_id) as max_score
    from tv_base
  ),
  jury_votes_scope as materialized (
    select jv.*
    from public.jury_votes jv
    where jv.voter_country_id is not null
      and (p_edition_id is null or jv.edition_id = p_edition_id)
  ),
  jury_ballots as materialized (
    select distinct edition_id, show_id, voter_country_id
    from jury_votes_scope
  ),
  eligible_participants as materialized (
    select
      p.edition_id,
      p.show_id,
      p.country_id,
      upper(c.short_code) as target_code
    from public.participants p
    join public.countries c on c.id = p.country_id
    where p.country_id is not null
      and (p.participation_status is null or p.participation_status = 'confirmed')
      and (p_edition_id is null or p.edition_id = p_edition_id)
  ),
  jury_targets as materialized (
    select distinct
      b.edition_id,
      b.show_id,
      b.voter_country_id,
      upper(vc.short_code) as voter_code,
      ep.target_code,
      ep.country_id as target_country_id
    from jury_ballots b
    join public.countries vc on vc.id = b.voter_country_id
    join eligible_participants ep
      on ep.edition_id = b.edition_id
     and (b.show_id is null or ep.show_id = b.show_id)
     and ep.country_id <> b.voter_country_id
  ),
  jury_base as (
    select
      concat(jt.edition_id, ':', coalesce(jt.show_id::text, 'edition'), ':', jt.voter_country_id) as ballot_id,
      jt.edition_id,
      'jury'::text as channel,
      jt.voter_code,
      jt.target_code,
      coalesce(jv.points, 0)::numeric as score
    from jury_targets jt
    left join jury_votes_scope jv
      on jv.edition_id = jt.edition_id
     and jv.voter_country_id = jt.voter_country_id
     and jv.receiving_country_id = jt.target_country_id
     and jv.show_id is not distinct from jt.show_id
    where p_channel in ('combined', 'jury')
  ),
  jury_observations as (
    select *, max(score) over (partition by ballot_id) as max_score
    from jury_base
  ),
  observations as materialized (
    select edition_id, channel, voter_code, target_code, score, max_score from tv_observations
    union all
    select edition_id, channel, voter_code, target_code, score, max_score from jury_observations
  ),
  per_edition_channel as materialized (
    select
      o.voter_code,
      o.target_code,
      o.edition_id,
      o.channel,
      avg(o.score)::numeric as score,
      max(o.max_score)::numeric as max_score,
      bool_or(o.score > 0) as supported,
      bool_or(o.score > 0 and o.score = o.max_score) as maximum,
      count(*)::integer as raw_opportunities,
      count(*) filter (where o.score > 0)::integer as raw_supported,
      count(*) filter (where o.score > 0 and o.score = o.max_score)::integer as raw_maximum,
      sum(o.score)::numeric as raw_points,
      sum(case when o.max_score > 0 then least(1::numeric, o.score / o.max_score) else 0::numeric end)::numeric as raw_normalized_sum
    from observations o
    group by o.voter_code, o.target_code, o.edition_id, o.channel
  ),
  per_edition as materialized (
    select
      e.voter_code,
      e.target_code,
      e.edition_id,
      bool_or(e.supported) as supported,
      bool_or(e.maximum) as maximum,
      bool_or(e.channel = 'jury' and e.supported) as jury_supported,
      bool_or(e.channel = 'televote' and e.supported) as televote_supported,
      sum(e.raw_normalized_sum) / nullif(sum(e.raw_opportunities), 0) as normalized_average
    from per_edition_channel e
    group by e.voter_code, e.target_code, e.edition_id
  ),
  positive_direction as materialized (
    select edition_id, channel, voter_code, target_code
    from per_edition_channel
    where supported
  ),
  reciprocal_undirected as materialized (
    select
      edition_id,
      channel,
      least(voter_code, target_code) as country_a,
      greatest(voter_code, target_code) as country_b
    from positive_direction
    group by edition_id, channel, least(voter_code, target_code), greatest(voter_code, target_code)
    having count(*) >= 2
  ),
  reciprocal_directed as materialized (
    select edition_id, country_a as voter_code, country_b as target_code from reciprocal_undirected
    union all
    select edition_id, country_b as voter_code, country_a as target_code from reciprocal_undirected
  ),
  reciprocal_aggregate as materialized (
    select voter_code, target_code, count(distinct edition_id)::integer as reciprocal_editions
    from reciprocal_directed
    group by voter_code, target_code
  ),
  reciprocal_map as materialized (
    select coalesce(
      jsonb_object_agg(voter_code || '>' || target_code, reciprocal_editions),
      '{}'::jsonb
    ) as values_by_pair
    from reciprocal_aggregate
  ),
  raw_pair as materialized (
    select
      e.voter_code,
      e.target_code,
      sum(e.raw_opportunities)::integer as opportunities,
      sum(e.raw_supported)::integer as supported,
      sum(e.raw_maximum)::integer as maximum_scores,
      sum(e.raw_points)::numeric as points,
      count(distinct e.edition_id)::integer as unique_editions,
      coalesce(sum(e.raw_opportunities) filter (where e.channel = 'jury'), 0)::integer as jury_opportunities,
      coalesce(sum(e.raw_supported) filter (where e.channel = 'jury'), 0)::integer as jury_supported,
      coalesce(sum(e.raw_points) filter (where e.channel = 'jury'), 0)::numeric as jury_points,
      coalesce(sum(e.raw_opportunities) filter (where e.channel = 'televote'), 0)::integer as televote_opportunities,
      coalesce(sum(e.raw_supported) filter (where e.channel = 'televote'), 0)::integer as televote_supported,
      coalesce(sum(e.raw_points) filter (where e.channel = 'televote'), 0)::numeric as televote_points
    from per_edition_channel e
    group by e.voter_code, e.target_code
  ),
  historical_pair as materialized (
    select
      e.voter_code,
      e.target_code,
      count(*)::integer as historical_opportunities,
      count(*) filter (where e.supported)::integer as historical_supported,
      count(*) filter (where e.maximum)::integer as historical_maximum,
      avg(e.score)::numeric as historical_average_score,
      avg(case when e.max_score > 0 then least(1::numeric, e.score / e.max_score) else 0::numeric end)::numeric as historical_normalized_average,
      count(*) filter (where e.channel = 'jury')::integer as jury_historical_opportunities,
      count(*) filter (where e.channel = 'jury' and e.supported)::integer as jury_historical_supported,
      count(distinct e.edition_id) filter (where e.channel = 'jury')::integer as jury_editions,
      count(*) filter (where e.channel = 'televote')::integer as televote_historical_opportunities,
      count(*) filter (where e.channel = 'televote' and e.supported)::integer as televote_historical_supported,
      count(distinct e.edition_id) filter (where e.channel = 'televote')::integer as televote_editions
    from per_edition_channel e
    group by e.voter_code, e.target_code
  ),
  edition_pair as materialized (
    select
      e.voter_code,
      e.target_code,
      count(*) filter (where e.supported)::integer as support_editions,
      count(*) filter (where e.maximum)::integer as maximum_editions,
      count(*) filter (where e.jury_supported and e.televote_supported)::integer as cross_channel_editions,
      avg(e.normalized_average)::numeric as outer_normalized_average
    from per_edition e
    group by e.voter_code, e.target_code
  ),
  base_pair as (
    select
      r.*,
      h.historical_opportunities,
      h.historical_supported,
      h.historical_maximum,
      h.historical_average_score,
      h.historical_normalized_average,
      h.jury_historical_opportunities,
      h.jury_historical_supported,
      h.jury_editions,
      h.televote_historical_opportunities,
      h.televote_historical_supported,
      h.televote_editions,
      e.support_editions,
      e.maximum_editions,
      e.cross_channel_editions,
      e.outer_normalized_average,
      coalesce((rm.values_by_pair ->> (r.voter_code || '>' || r.target_code))::integer, 0) as reciprocal_editions
    from raw_pair r
    join historical_pair h using (voter_code, target_code)
    join edition_pair e using (voter_code, target_code)
    cross join reciprocal_map rm
  ),
  risk_inputs as (
    select
      b.*,
      least(1::numeric, b.unique_editions::numeric / 5::numeric) as evidence_factor,
      b.historical_supported::numeric / nullif(b.historical_opportunities, 0) as support_rate,
      b.historical_maximum::numeric / nullif(b.historical_opportunities, 0) as maximum_rate,
      b.reciprocal_editions::numeric / nullif(b.unique_editions, 0) as reciprocal_rate,
      b.cross_channel_editions::numeric / nullif(b.unique_editions, 0) as cross_channel_rate,
      b.jury_historical_supported::numeric / nullif(b.jury_historical_opportunities, 0) as jury_support_rate,
      b.televote_historical_supported::numeric / nullif(b.televote_historical_opportunities, 0) as televote_support_rate
    from base_pair b
  ),
  scored as materialized (
    select
      r.*,
      round(100 * (
        0.50 * r.support_rate
        + 0.20 * r.maximum_rate
        + 0.15 * r.reciprocal_rate
        + 0.10 * r.cross_channel_rate
        + 0.05 * r.historical_normalized_average
      ) * r.evidence_factor)::integer as risk_score,
      round(100 * r.evidence_factor * case
        when r.jury_historical_opportunities > 0 and r.televote_historical_opportunities > 0 then 1
        else 0.8
      end)::integer as confidence,
      case when r.jury_historical_opportunities > 0 then
        round(100 * r.jury_support_rate * least(1::numeric, r.jury_editions::numeric / 5::numeric))::integer
      else 0 end as jury_risk,
      case when r.televote_historical_opportunities > 0 then
        round(100 * r.televote_support_rate * least(1::numeric, r.televote_editions::numeric / 5::numeric))::integer
      else 0 end as televote_risk,
      round(100 * r.cross_channel_rate * r.evidence_factor)::integer as cross_channel_risk,
      round(100 * r.support_rate * r.evidence_factor)::integer as relationship_anomaly,
      round(100 * r.reciprocal_rate * least(1::numeric, r.reciprocal_editions::numeric / 4::numeric))::integer as reciprocity_risk,
      round(100 * r.historical_normalized_average * r.evidence_factor)::integer as intensity_risk
    from risk_inputs r
  ),
  limited_relationships as materialized (
    select
      s.*,
      coalesce(vc.name, s.voter_code) as voting_country_name,
      coalesce(tc.name, s.target_code) as target_country_name
    from scored s
    left join public.countries vc on upper(vc.short_code) = s.voter_code
    left join public.countries tc on upper(tc.short_code) = s.target_code
    order by s.risk_score desc, s.unique_editions desc, s.opportunities desc
    limit p_limit
  ),
  edition_rows as materialized (
    select id, name, edition_number
    from public.editions
    order by edition_number desc nulls last, name asc
  )
  select jsonb_build_object(
    'relationships', coalesce((
      select jsonb_agg(to_jsonb(lr) order by lr.risk_score desc, lr.unique_editions desc, lr.opportunities desc)
      from limited_relationships lr
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'ballots', (select count(*) from scoped_submissions),
      'active', (select count(*) from scoped_submissions),
      'deleted', (select count(*) from televoting.vote_submissions where status = 'deleted'),
      'suspicious', (select count(*) from scoped_submissions where status = 'suspicious'),
      'verified', (select count(*) from scoped_submissions where status = 'verified'),
      'highRisk', (select count(*) from scoped_submissions where risk_score >= 65),
      'vpn', (select count(*) from scoped_submissions where is_vpn),
      'rounds', (select count(*) from televoting.rounds),
      'juryBallots', (select count(*) from jury_ballots),
      'juryVotes', (select count(*) from jury_votes_scope),
      'relationships', (select count(*) from scored),
      'attentionRelationships', (select count(*) from scored where risk_score >= 50),
      'hodAssignedEditionCountries', 0,
      'hodUnknownEditionCountries', 0
    ),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'countryCode', s.country_code,
        'username', s.username,
        'usernameNormalized', s.username_normalized,
        'isVpn', s.is_vpn,
        'riskScore', s.risk_score,
        'status', s.status
      ) order by s.created_at)
      from scoped_submissions s
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_object_agg(upper(c.short_code), c.name)
      from public.countries c
      where c.short_code is not null
    ), '{}'::jsonb),
    'editions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'editionNumber', e.edition_number
      ) order by e.edition_number desc nulls last, e.name asc)
      from edition_rows e
    ), '[]'::jsonb)
  ) into result_payload;

  return result_payload;
end;
$$;

revoke all on function public.friend_voting_historical_country_payload(text, uuid, integer) from public;
revoke all on function public.friend_voting_historical_country_payload(text, uuid, integer) from anon;
grant execute on function public.friend_voting_historical_country_payload(text, uuid, integer) to authenticated;
grant execute on function public.friend_voting_historical_country_payload(text, uuid, integer) to service_role;

comment on function public.friend_voting_historical_country_payload(text, uuid, integer) is
  'Worker-safe historical country-level Friend Voting aggregation. Preserves jury/televote zero-opportunity semantics while moving broad historical aggregation out of the Cloudflare Worker.';
