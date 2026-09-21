do $$
declare
  solaris_edition uuid;
  remote_edition uuid;
  rec record;
  canonical_count integer;
  target_count integer;
  submission_count integer;
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

  for rec in
    select
      mapping.show_sort_order,
      mapping.round_name,
      s.id as show_id,
      r.id as round_id
    from (
      values
        (1, 'First semi-final'::text),
        (2, 'Second semi-final'::text),
        (3, 'Third semi-final'::text)
    ) mapping(show_sort_order, round_name)
    join public.shows s
      on s.edition_id = solaris_edition
     and s.sort_order = mapping.show_sort_order
    join televoting.rounds r
      on r.edition_id = remote_edition
     and r.name = mapping.round_name
    order by mapping.show_sort_order
  loop
    select count(*) into canonical_count
    from public.results pr
    where pr.show_id = rec.show_id;

    select
      count(distinct ve.target_country_code),
      count(distinct vs.id)
    into target_count, submission_count
    from televoting.vote_submissions vs
    join televoting.vote_entries ve
      on ve.submission_id = vs.id
    where vs.round_id = rec.round_id
      and vs.deleted_at is null
      and vs.status in ('active', 'verified');

    if canonical_count = 0 then
      raise exception 'SSC21 % has ballots but no canonical public results', rec.round_name;
    end if;

    if target_count <> canonical_count then
      raise exception
        'SSC21 % target count mismatch: ballot targets %, canonical results %',
        rec.round_name, target_count, canonical_count;
    end if;

    if submission_count = 0 then
      raise exception 'SSC21 % has no preserved valid ballot submissions', rec.round_name;
    end if;

    delete from public.public_televote_country_contributions
    where show_id = rec.show_id
      and round_id = rec.round_id::text;

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
      rec.show_id,
      rec.round_id::text,
      rec.round_name,
      'round',
      0,
      null,
      c.short_code,
      pr.televote_points,
      coalesce(matrix.raw_score, 0),
      null,
      coalesce(matrix.contributions, '{}'::jsonb),
      now()
    from public.results pr
    join public.countries c
      on c.id = pr.country_id
    left join lateral (
      select
        sum(per_voter.points)::numeric as raw_score,
        jsonb_object_agg(
          per_voter.voter_country,
          per_voter.points
          order by per_voter.voter_country
        ) as contributions
      from (
        select
          upper(trim(vs.country_code)) as voter_country,
          sum(ve.points)::integer as points
        from televoting.vote_submissions vs
        join televoting.vote_entries ve
          on ve.submission_id = vs.id
        where vs.round_id = rec.round_id
          and vs.deleted_at is null
          and vs.status in ('active', 'verified')
          and ve.target_country_code = c.short_code
        group by upper(trim(vs.country_code))
        having sum(ve.points) > 0
      ) per_voter
    ) matrix on true
    where pr.show_id = rec.show_id;

    if (
      select count(*)
      from public.public_televote_country_contributions p
      where p.show_id = rec.show_id
        and p.round_id = rec.round_id::text
    ) <> canonical_count then
      raise exception 'SSC21 % public detail snapshot row-count mismatch', rec.round_name;
    end if;

    if exists (
      select 1
      from public.public_televote_country_contributions p
      where p.show_id = rec.show_id
        and p.round_id = rec.round_id::text
        and p.raw_score is distinct from coalesce((
          select sum(value::numeric)
          from jsonb_each_text(p.country_contributions)
        ), 0)
    ) then
      raise exception 'SSC21 % source matrix does not reconcile to raw score', rec.round_name;
    end if;

    if rec.round_name = 'Third semi-final' and exists (
      select 1
      from public.public_televote_country_contributions p
      join televoting.round_results rr
        on rr.round_id = rec.round_id
       and rr.country_code = p.country_code
      where p.show_id = rec.show_id
        and p.raw_score is distinct from rr.original_votes::numeric
    ) then
      raise exception 'SSC21 Third semi-final ballot reconstruction disagrees with archived raw totals';
    end if;
  end loop;
end $$;
