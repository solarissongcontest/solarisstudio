-- Extend the sanitized public televote snapshot so one public show can expose
-- every enabled source/round that formed its published televote.
--
-- The snapshot remains aggregate-only. No usernames, raw ballot identities,
-- integrity metadata, IP/device information, or internal calculation config
-- are copied into public.
alter table public.public_televote_country_contributions
  add column if not exists source_type text not null default 'round',
  add column if not exists display_order integer not null default 0,
  add column if not exists weight_percent numeric null,
  add column if not exists raw_score numeric null;

comment on column public.public_televote_country_contributions.source_type is
'Public-safe source category, for example round, instagram, or activity.';
comment on column public.public_televote_country_contributions.display_order is
'Stable public ordering for sources belonging to the same show.';
comment on column public.public_televote_country_contributions.weight_percent is
'Published percentage weight of this source in a Combined Televote when available.';
comment on column public.public_televote_country_contributions.raw_score is
'Aggregate recipient score before the source is converted/allocated into final televote points.';

-- Make the historical SSC21 real show-round relationships explicit. This does
-- not expose results by itself; it gives future syncs a durable canonical map.
do $$
declare
  solaris_edition uuid;
  remote_edition uuid;
begin
  select id into solaris_edition
  from public.editions
  where edition_number = 21
  limit 1;

  select id into remote_edition
  from televoting.editions
  where name = 'Solaris Song Contest 21'
  order by created_at
  limit 1;

  if solaris_edition is null and remote_edition is null then
    return;
  end if;

  if solaris_edition is null or remote_edition is null then
    raise exception 'SSC21 exists only on one side of the Solaris/Televoting archive link';
  end if;

  insert into public.televoting_round_bindings (
    remote_round_id,
    remote_edition_id,
    edition_id,
    show_id,
    source_mode,
    last_synced_at,
    frozen_at,
    created_at,
    updated_at
  )
  select
    r.id::text,
    remote_edition::text,
    solaris_edition,
    s.id,
    'show',
    null,
    coalesce(r.closed_at, r.updated_at, now()),
    now(),
    now()
  from (
    values
      ('First semi-final'::text, 1),
      ('Second semi-final'::text, 2),
      ('Third semi-final'::text, 3),
      ('Grand Final round 1'::text, 4)
  ) mapping(round_name, show_sort_order)
  join televoting.rounds r
    on r.edition_id = remote_edition
   and r.name = mapping.round_name
  join public.shows s
    on s.edition_id = solaris_edition
   and s.sort_order = mapping.show_sort_order
  on conflict (remote_round_id) do update
  set
    remote_edition_id = excluded.remote_edition_id,
    edition_id = excluded.edition_id,
    show_id = excluded.show_id,
    source_mode = 'show',
    updated_at = now();
end $$;

-- Rebuild SSC21 Grand Final public detail from the published Combined Televote.
-- All enabled sources are represented separately:
--   * Grand Final round 1
--   * Story voting
--   * Activity points
--
-- For Round 1, the country-to-country matrix is reconstructed only from
-- accepted/non-deleted aggregate ballot entries and is verified against the
-- stored Combined source raw score. Story-voting contribution units come from
-- the preserved historical observation matrix. Activity points are recipient
-- totals only.
do $$
declare
  solaris_edition uuid;
  remote_edition uuid;
  target_show uuid;
  aggregation_id uuid;
  calculation_version integer;
  enabled_source_count integer;
  combined_row_count integer;
  expected_snapshot_rows integer;
begin
  select id into solaris_edition
  from public.editions
  where edition_number = 21
  limit 1;

  select id into remote_edition
  from televoting.editions
  where name = 'Solaris Song Contest 21'
  order by created_at
  limit 1;

  select a.id, a.calculation_version
  into aggregation_id, calculation_version
  from televoting.televote_aggregations a
  where a.edition_id = remote_edition
    and a.name = 'SSC21 Grand Final'
    and a.status = 'published'
  order by a.calculated_at desc nulls last, a.updated_at desc
  limit 1;

  -- Historical archive rows are production data, not clean-install seed data.
  if aggregation_id is null then
    return;
  end if;

  select s.id into target_show
  from public.shows s
  where s.edition_id = solaris_edition
    and s.kind = 'grand-final'
  order by s.sort_order, s.id
  limit 1;

  if target_show is null then
    raise exception 'SSC21 published Combined Televote exists but the Solaris Grand Final show is missing';
  end if;

  select count(*) into enabled_source_count
  from televoting.televote_aggregation_sources src
  where src.aggregation_id = aggregation_id
    and src.enabled is true;

  if enabled_source_count <> 3 then
    raise exception 'SSC21 Grand Final expected 3 enabled televote sources, found %', enabled_source_count;
  end if;

  if not exists (
    select 1
    from televoting.televote_aggregation_sources src
    where src.aggregation_id = aggregation_id
      and src.enabled is true
      and src.source_type = 'round'
      and src.source_name = 'Grand Final round 1'
  ) or not exists (
    select 1
    from televoting.televote_aggregation_sources src
    where src.aggregation_id = aggregation_id
      and src.enabled is true
      and src.source_type = 'instagram'
      and src.source_name = 'Story voting'
  ) or not exists (
    select 1
    from televoting.televote_aggregation_sources src
    where src.aggregation_id = aggregation_id
      and src.enabled is true
      and src.source_type = 'activity'
      and src.source_name = 'Activity points'
  ) then
    raise exception 'SSC21 Grand Final enabled source set does not match the published archive';
  end if;

  select count(*) into combined_row_count
  from televoting.combined_televote_results ctr
  where ctr.aggregation_id = aggregation_id
    and ctr.calculation_version = calculation_version;

  if combined_row_count <> 26 then
    raise exception 'SSC21 Grand Final expected 26 Combined result rows, found %', combined_row_count;
  end if;

  -- The canonical Solaris show result must agree with the published Combined
  -- final score before we expose component details.
  if exists (
    select 1
    from televoting.combined_televote_results ctr
    left join public.countries c
      on c.short_code = ctr.country_code
    left join public.televote_votes tv
      on tv.show_id = target_show
     and tv.country_id = c.id
    where ctr.aggregation_id = aggregation_id
      and ctr.calculation_version = calculation_version
      and (
        c.id is null
        or tv.country_id is null
        or tv.points is distinct from ctr.final_combined_points::integer
      )
  ) then
    raise exception 'SSC21 canonical Solaris televote does not match the published Combined result';
  end if;

  delete from public.public_televote_country_contributions
  where show_id = target_show;

  with enabled_sources as (
    select
      src.*,
      row_number() over (
        order by
          coalesce(src.display_order, 0),
          case src.source_type
            when 'round' then 0
            when 'instagram' then 1
            when 'activity' then 2
            else 3
          end,
          src.created_at,
          src.id
      ) - 1 as effective_order
    from televoting.televote_aggregation_sources src
    where src.aggregation_id = aggregation_id
      and src.enabled is true
  ),
  component_rows as (
    select
      ctr.country_code,
      src.id as source_id,
      src.source_type,
      src.source_round_id,
      src.source_name,
      src.percentage_weight,
      src.effective_order,
      component.value as contribution
    from televoting.combined_televote_results ctr
    cross join lateral jsonb_array_elements(ctr.source_contributions) component(value)
    join enabled_sources src
      on src.id::text = component.value ->> 'source_id'
    where ctr.aggregation_id = aggregation_id
      and ctr.calculation_version = calculation_version
  )
  insert into public.public_televote_country_contributions (
    show_id,
    round_id,
    round_name,
    source_type,
    display_order,
    weight_percent,
    country_code,
    final_points,
    raw_score,
    activity_points,
    country_contributions,
    updated_at
  )
  select
    target_show,
    case
      when cr.source_round_id is not null then cr.source_round_id::text
      else 'aggregation-source:' || cr.source_id::text
    end,
    cr.source_name,
    cr.source_type,
    cr.effective_order::integer,
    cr.percentage_weight,
    cr.country_code,
    coalesce((cr.contribution ->> 'allocated_points')::numeric, 0)::integer,
    nullif(cr.contribution ->> 'raw_score', '')::numeric,
    case
      when cr.source_type = 'activity'
        then nullif(cr.contribution ->> 'raw_score', '')::numeric
      else null
    end,
    case
      when cr.source_type = 'round' and cr.source_round_id is not null then
        coalesce((
          select jsonb_object_agg(ballot.voter_country, ballot.points order by ballot.voter_country)
          from (
            select
              upper(trim(vs.country_code)) as voter_country,
              sum(ve.points)::integer as points
            from televoting.vote_submissions vs
            join televoting.vote_entries ve
              on ve.submission_id = vs.id
            where vs.round_id = cr.source_round_id
              and vs.deleted_at is null
              and vs.status in ('active', 'verified')
              and ve.target_country_code = cr.country_code
            group by upper(trim(vs.country_code))
            having sum(ve.points) > 0
          ) ballot
        ), '{}'::jsonb)
      when cr.source_type = 'instagram' then
        coalesce((
          select jsonb_object_agg(h.voter_country_code, h.score order by h.voter_country_code)
          from televoting.historical_vote_observations h
          where h.source_key = 'ssc21_instagram_story_detailed_pdf_2026_09_09'
            and h.target_country_code = cr.country_code
            and h.score > 0
        ), '{}'::jsonb)
      else '{}'::jsonb
    end,
    now()
  from component_rows cr
  on conflict (show_id, round_id, country_code) do update
  set
    round_name = excluded.round_name,
    source_type = excluded.source_type,
    display_order = excluded.display_order,
    weight_percent = excluded.weight_percent,
    final_points = excluded.final_points,
    raw_score = excluded.raw_score,
    activity_points = excluded.activity_points,
    country_contributions = excluded.country_contributions,
    updated_at = excluded.updated_at;

  expected_snapshot_rows := enabled_source_count * combined_row_count;

  if (
    select count(*)
    from public.public_televote_country_contributions p
    where p.show_id = target_show
  ) <> expected_snapshot_rows then
    raise exception
      'SSC21 public multi-source snapshot expected % rows, produced %',
      expected_snapshot_rows,
      (
        select count(*)
        from public.public_televote_country_contributions p
        where p.show_id = target_show
      );
  end if;

  if (
    select count(distinct p.round_id)
    from public.public_televote_country_contributions p
    where p.show_id = target_show
  ) <> enabled_source_count then
    raise exception 'SSC21 public multi-source snapshot did not preserve every enabled source';
  end if;

  if (
    select coalesce(sum(p.final_points), 0)
    from public.public_televote_country_contributions p
    where p.show_id = target_show
  ) <> (
    select coalesce(sum(ctr.final_combined_points), 0)
    from televoting.combined_televote_results ctr
    where ctr.aggregation_id = aggregation_id
      and ctr.calculation_version = calculation_version
  ) then
    raise exception 'SSC21 component allocated points do not sum to the published Combined televote';
  end if;

  -- For the real ballot round, the public country-source matrix must reconcile
  -- exactly to the Combined source raw score for every recipient.
  if exists (
    select 1
    from public.public_televote_country_contributions p
    where p.show_id = target_show
      and p.source_type = 'round'
      and p.round_name = 'Grand Final round 1'
      and p.raw_score is distinct from coalesce((
        select sum(value::numeric)
        from jsonb_each_text(p.country_contributions)
      ), 0)
  ) then
    raise exception 'SSC21 Grand Final round 1 public source matrix does not reconcile to its stored raw score';
  end if;
end $$;

-- Preserve the archived Third Semi-Final as a totals-only public round. The
-- first two semi-final Televoting rounds contain no stored result rows, so no
-- fictional result is created for them.
do $$
declare
  solaris_edition uuid;
  remote_edition uuid;
  target_show uuid;
  target_round uuid;
begin
  select id into solaris_edition
  from public.editions
  where edition_number = 21
  limit 1;

  select id into remote_edition
  from televoting.editions
  where name = 'Solaris Song Contest 21'
  order by created_at
  limit 1;

  select s.id into target_show
  from public.shows s
  where s.edition_id = solaris_edition
    and s.sort_order = 3
  limit 1;

  select r.id into target_round
  from televoting.rounds r
  where r.edition_id = remote_edition
    and r.name = 'Third semi-final'
  limit 1;

  if target_show is null or target_round is null then
    return;
  end if;

  if not exists (
    select 1 from televoting.round_results rr where rr.round_id = target_round
  ) then
    return;
  end if;

  delete from public.public_televote_country_contributions
  where show_id = target_show
    and round_id = target_round::text;

  insert into public.public_televote_country_contributions (
    show_id,
    round_id,
    round_name,
    source_type,
    display_order,
    weight_percent,
    country_code,
    final_points,
    raw_score,
    activity_points,
    country_contributions,
    updated_at
  )
  select
    target_show,
    target_round::text,
    'Third semi-final',
    'round',
    0,
    null,
    rr.country_code,
    rr.final_points,
    rr.original_votes,
    null,
    case
      when jsonb_typeof(rr.calculation_config -> 'country_contributions') = 'object'
        then rr.calculation_config -> 'country_contributions'
      else '{}'::jsonb
    end,
    now()
  from televoting.round_results rr
  where rr.round_id = target_round;
end $$;

-- Backfill aggregate raw scores for the already-public SSC20 archive where the
-- source round is known. Existing SSC20 country-source matrices stay untouched.
update public.public_televote_country_contributions p
set
  source_type = 'round',
  display_order = 0,
  raw_score = rr.original_votes,
  updated_at = now()
from televoting.round_results rr
where p.round_id = rr.round_id::text
  and p.country_code = rr.country_code
  and p.raw_score is null;
