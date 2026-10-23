begin;

-- System V3 / Public Results boundary: Voting DNA must preserve the independent
-- publication authority of generic Results, Jury Results and Televote Results.
--
-- The legacy public_country_voting_dna(uuid) aggregate admits a result row when
-- generic Results are public and then serializes jury_points + televote_points
-- together. That allows split layers to cross the Public API boundary before
-- their own publication flags are enabled. V3 receives a new bounded projection
-- rather than mutating the legacy compatibility RPC in place.
select public.v3_register_migration_contract(
  'v3.results.public-voting-dna-publication-boundary-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Adds the V3 Public Voting DNA projection with independently gated Jury and Televote result layers while preserving the legacy RPC for older clients'
);

create or replace function public.v3_public_country_voting_dna(
  p_country_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with detailed_votes as (
    select
      vote.edition_id,
      vote.show_id,
      coalesce(vote.voter_country_id, voter_entity.country_id) as voter_country_id,
      coalesce(vote.receiving_country_id, receiving_entity.country_id) as receiving_country_id,
      vote.points
    from public.jury_votes vote
    join public.editions edition on edition.id = vote.edition_id
    left join public.contest_entities voter_entity
      on voter_entity.id = vote.voter_entity_id
     and voter_entity.edition_id = vote.edition_id
    left join public.contest_entities receiving_entity
      on receiving_entity.id = vote.receiving_entity_id
     and receiving_entity.edition_id = vote.edition_id
    where edition.published = true
      and vote.show_id is not null
      and public.show_publication_enabled(vote.show_id, 'detailed_voting')
  ),
  detailed_scope as (
    select distinct detailed_votes.edition_id
    from detailed_votes
    where detailed_votes.voter_country_id = p_country_id
       or detailed_votes.receiving_country_id = p_country_id
  ),
  given as (
    select
      detailed_votes.receiving_country_id as country_id,
      sum(detailed_votes.points)::bigint as points,
      count(*)::bigint as ballots
    from detailed_votes
    where detailed_votes.voter_country_id = p_country_id
      and detailed_votes.receiving_country_id is not null
      and detailed_votes.receiving_country_id <> p_country_id
    group by detailed_votes.receiving_country_id
    order by points desc, ballots desc, detailed_votes.receiving_country_id
    limit 10
  ),
  received as (
    select
      detailed_votes.voter_country_id as country_id,
      sum(detailed_votes.points)::bigint as points,
      count(*)::bigint as ballots
    from detailed_votes
    where detailed_votes.receiving_country_id = p_country_id
      and detailed_votes.voter_country_id is not null
      and detailed_votes.voter_country_id <> p_country_id
    group by detailed_votes.voter_country_id
    order by points desc, ballots desc, detailed_votes.voter_country_id
    limit 10
  ),
  visible_results as (
    select
      result.edition_id,
      result.show_id,
      result.final_rank,
      result.jury_points,
      result.televote_points,
      result.total_points,
      public.show_publication_enabled(result.show_id, 'jury_results') as jury_published,
      public.show_publication_enabled(result.show_id, 'televote_results') as televote_published,
      show.kind,
      show.sort_order,
      result.updated_at
    from public.results result
    join public.shows show on show.id = result.show_id
    join public.editions edition on edition.id = result.edition_id
    left join public.contest_entities result_entity
      on result_entity.id = result.contest_entity_id
     and result_entity.edition_id = result.edition_id
    where edition.published = true
      and result.show_id is not null
      and (
        result.country_id = p_country_id
        or result_entity.country_id = p_country_id
      )
      and public.show_publication_enabled(result.show_id, 'results')
  ),
  ranked_results as (
    select
      visible_results.*,
      row_number() over (
        partition by visible_results.edition_id
        order by
          case visible_results.kind
            when 'grand-final' then 0
            when 'semi-final' then 1
            when 'second-chance' then 2
            when 'heat' then 3
            else 4
          end,
          visible_results.sort_order desc nulls last,
          visible_results.updated_at desc,
          visible_results.show_id
      ) as rn
    from visible_results
  ),
  selected_results as (
    select *
    from ranked_results
    where ranked_results.rn = 1
  ),
  sample as (
    select
      (select count(*)::bigint from detailed_scope) as detailed_editions,
      (
        select coalesce(sum(detailed_votes.points), 0)::bigint
        from detailed_votes
        where detailed_votes.voter_country_id = p_country_id
      ) as given_points,
      (
        select coalesce(sum(detailed_votes.points), 0)::bigint
        from detailed_votes
        where detailed_votes.receiving_country_id = p_country_id
      ) as received_points,
      (select count(*)::bigint from selected_results) as result_editions
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'formulaVersion', 'v1',
    'sample', jsonb_build_object(
      'detailedEditions', sample.detailed_editions,
      'detailedEditionIds', coalesce((
        select jsonb_agg(detailed_scope.edition_id order by detailed_scope.edition_id)
        from detailed_scope
      ), '[]'::jsonb),
      'givenPoints', sample.given_points,
      'receivedPoints', sample.received_points,
      'resultEditions', sample.result_editions
    ),
    'topGiven', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'countryId', given.country_id,
          'points', given.points,
          'ballots', given.ballots
        )
        order by given.points desc, given.ballots desc, given.country_id
      )
      from given
    ), '[]'::jsonb),
    'topReceived', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'countryId', received.country_id,
          'points', received.points,
          'ballots', received.ballots
        )
        order by received.points desc, received.ballots desc, received.country_id
      )
      from received
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'editionId', selected_results.edition_id,
          'showId', selected_results.show_id,
          'finalRank', selected_results.final_rank,
          'totalPoints', selected_results.total_points,
          'juryPublished', selected_results.jury_published,
          'juryPoints', case
            when selected_results.jury_published then selected_results.jury_points
            else null
          end,
          'televotePublished', selected_results.televote_published,
          'televotePoints', case
            when selected_results.televote_published then selected_results.televote_points
            else null
          end
        )
        order by edition.edition_number desc nulls last, edition.year desc nulls last, selected_results.edition_id
      )
      from selected_results
      join public.editions edition on edition.id = selected_results.edition_id
    ), '[]'::jsonb)
  )
  from sample;
$function$;

revoke all on function public.v3_public_country_voting_dna(uuid) from public;
grant execute on function public.v3_public_country_voting_dna(uuid) to anon, authenticated, service_role;

comment on function public.v3_public_country_voting_dna(uuid) is
  'V3 bounded Public Country Voting DNA projection. Generic Results control rank/total visibility; Jury and Televote point layers are independently gated and serialize as null until their own publication policy is public.';

commit;
