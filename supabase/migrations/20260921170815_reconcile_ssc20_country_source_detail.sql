-- Repair the country-source breakdown in the archived SSC20 round from the
-- organizer PDF observations. The official converted points remain untouched.
do $$
declare
  target_round uuid;
  expected_source constant text := 'ssc20_grand_final_country_detailed_pdf_2026_09_09';
begin
  select r.id into strict target_round
  from televoting.rounds r
  join televoting.editions e on e.id = r.edition_id
  where e.name = 'Solaris Song Contest 20' and r.name = 'Grand Final';

  if (select count(*) from televoting.round_results where round_id = target_round) <> 26
     or (select count(*) from televoting.historical_vote_observations where source_key = expected_source) <> 627
     or (select count(*) from televoting.historical_vote_observations where source_key = expected_source and score > 0) <> 219
     or exists (
       select 1 from televoting.round_results rr
       where rr.round_id = target_round
         and rr.original_votes <> coalesce((rr.calculation_config->>'activity_points')::integer, 0)
           + (select coalesce(sum(h.score), 0) from televoting.historical_vote_observations h
              where h.source_key = expected_source and h.target_country_code = rr.country_code)
     ) then
    raise exception 'SSC20 PDF observations do not reconcile with archived round raw totals';
  end if;

  update televoting.round_results rr
  set calculation_config = jsonb_set(
    coalesce(rr.calculation_config, '{}'::jsonb),
    '{country_contributions}',
    coalesce((
      select jsonb_object_agg(h.voter_country_code, h.score)
      from televoting.historical_vote_observations h
      where h.source_key = expected_source
        and h.target_country_code = rr.country_code
        and h.score > 0
    ), '{}'::jsonb), true
  )
  where rr.round_id = target_round;

  -- The public snapshot may have been generated before this reconciliation.
  -- Refresh it from the repaired source so the UI cannot stay stale.
  update public.public_televote_country_contributions p
  set
    country_contributions = rr.calculation_config -> 'country_contributions',
    final_points = rr.final_points,
    updated_at = now()
  from televoting.round_results rr
  where p.round_id = target_round::text
    and rr.round_id = target_round
    and rr.country_code = p.country_code;

  if exists (
    select 1
    from televoting.round_results rr
    join public.public_televote_country_contributions p
      on p.round_id = target_round::text
     and p.country_code = rr.country_code
    where rr.round_id = target_round
      and rr.calculation_config -> 'country_contributions'
          is distinct from p.country_contributions
  ) then
    raise exception 'SSC20 public country-source snapshot is stale after reconciliation';
  end if;
end $$;
