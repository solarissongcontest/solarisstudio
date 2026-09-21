-- Ensure existing databases that already ran the original SSC20 reconciliation
-- also refresh the sanitized public snapshot from the repaired archived source.
--
-- This is intentionally a no-op on clean databases without the historical SSC20
-- archive, but fails closed if the archive exists without its canonical targets.
do $$
declare
  target_round uuid;
  target_show uuid;
  expected_source constant text := 'ssc20_grand_final_country_detailed_pdf_2026_09_09';
  source_count integer;
begin
  select count(*) into source_count
  from televoting.historical_vote_observations h
  where h.source_key = expected_source;

  if source_count = 0 then
    return;
  end if;

  if source_count <> 627 then
    raise exception 'SSC20 public snapshot refresh found a partial source archive: % rows', source_count;
  end if;

  select r.id into target_round
  from televoting.rounds r
  join televoting.editions e on e.id = r.edition_id
  where e.name = 'Solaris Song Contest 20'
    and r.name = 'Grand Final'
  order by r.created_at
  limit 1;

  select s.id into target_show
  from public.shows s
  join public.editions e on e.id = s.edition_id
  where e.edition_number = 20
    and s.kind = 'grand-final'
  order by s.sort_order, s.id
  limit 1;

  if target_round is null or target_show is null then
    raise exception 'SSC20 historical archive exists but its canonical round/show mapping is missing';
  end if;

  if (
    select count(*)
    from public.public_televote_country_contributions
    where show_id = target_show
      and round_id = target_round::text
  ) <> 26 then
    raise exception 'SSC20 historical archive exists but its public detail snapshot is incomplete';
  end if;

  update public.public_televote_country_contributions p
  set
    country_contributions = rr.calculation_config -> 'country_contributions',
    final_points = tv.points,
    updated_at = now()
  from televoting.round_results rr
  join public.countries c
    on c.short_code = rr.country_code
  join public.televote_votes tv
    on tv.show_id = target_show
   and tv.country_id = c.id
  where p.show_id = target_show
    and p.round_id = target_round::text
    and rr.round_id = target_round
    and rr.country_code = p.country_code
    and jsonb_typeof(rr.calculation_config -> 'country_contributions') = 'object';

  if exists (
    select 1
    from televoting.round_results rr
    join public.public_televote_country_contributions p
      on p.show_id = target_show
     and p.round_id = target_round::text
     and p.country_code = rr.country_code
    where rr.round_id = target_round
      and rr.calculation_config -> 'country_contributions'
          is distinct from p.country_contributions
  ) then
    raise exception 'SSC20 public country-source snapshot remains stale';
  end if;
end $$;
