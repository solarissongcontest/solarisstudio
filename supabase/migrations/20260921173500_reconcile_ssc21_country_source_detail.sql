-- Populate SSC21 Grand Final country-source public-vote transparency from
-- the archived Instagram/Story observation matrix while keeping official
-- televote points sourced from canonical Solaris results.
do $$
declare
  target_show uuid;
  detail_source_key constant text := 'ssc21_instagram_story_detailed_pdf_2026_09_09';
  detail_round_id constant text := 'historical:ssc21_instagram_story_voting';
  detail_round_name constant text := 'Instagram / Story voting';
  observation_count integer;
  voter_count integer;
  target_count integer;
  canonical_count integer;
begin
  select s.id into strict target_show
  from public.shows s
  join public.editions e on e.id = s.edition_id
  where e.edition_number = 21
    and s.kind = 'grand-final';

  select
    count(*),
    count(distinct h.voter_country_code),
    count(distinct h.target_country_code)
  into observation_count, voter_count, target_count
  from televoting.historical_vote_observations h
  where h.source_key = detail_source_key;

  select count(*) into canonical_count
  from public.televote_votes
  where show_id = target_show;

  if observation_count <> 704
     or voter_count <> 28
     or target_count <> 26
     or canonical_count <> 26 then
    raise exception
      'SSC21 historical detail does not meet expected counts: observations %, voters %, targets %, canonical %',
      observation_count, voter_count, target_count, canonical_count;
  end if;

  if exists (
    select 1
    from (
      select distinct h.target_country_code
      from televoting.historical_vote_observations h
      where h.source_key = detail_source_key
    ) observed
    left join public.countries c
      on c.short_code = observed.target_country_code
    left join public.televote_votes tv
      on tv.show_id = target_show
     and tv.country_id = c.id
    where c.id is null or tv.id is null
  ) then
    raise exception 'SSC21 historical detail contains an unmapped or non-finalist target country';
  end if;

  delete from public.public_televote_country_contributions
  where show_id = target_show;

  insert into public.public_televote_country_contributions (
    show_id,
    round_id,
    round_name,
    country_code,
    final_points,
    activity_points,
    country_contributions,
    updated_at
  )
  select
    target_show,
    detail_round_id,
    detail_round_name,
    c.short_code,
    tv.points,
    null,
    coalesce(
      jsonb_object_agg(
        h.voter_country_code,
        h.score
        order by h.voter_country_code
      ) filter (where h.score > 0),
      '{}'::jsonb
    ),
    now()
  from public.televote_votes tv
  join public.countries c
    on c.id = tv.country_id
  left join televoting.historical_vote_observations h
    on h.source_key = detail_source_key
   and h.target_country_code = c.short_code
  where tv.show_id = target_show
  group by c.short_code, tv.points;

  if (
    select count(*)
    from public.public_televote_country_contributions
    where show_id = target_show
  ) <> 26 then
    raise exception 'SSC21 public detail snapshot did not produce 26 recipient rows';
  end if;
end $$;
