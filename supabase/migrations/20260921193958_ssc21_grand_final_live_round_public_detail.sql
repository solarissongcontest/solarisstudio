-- Preserve SSC21's Grand Final live round as a supplementary raw-only
-- public transparency source. It was not an enabled source in the published
-- Combined Televote, so it must never be presented as allocated official points.
do $$
declare
  solaris_edition uuid;
  remote_edition uuid;
  target_show uuid;
  target_round uuid;
  result_count integer;
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

  select s.id into target_show
  from public.shows s
  where s.edition_id = solaris_edition
    and s.kind = 'grand-final'
  order by s.sort_order, s.id
  limit 1;

  select r.id into target_round
  from televoting.rounds r
  where r.edition_id = remote_edition
    and r.name = 'Grand final live round'
  order by r.created_at
  limit 1;

  if target_round is null then
    return;
  end if;

  if target_show is null then
    raise exception 'SSC21 live round exists but the canonical Grand Final show is missing';
  end if;

  select count(*) into result_count
  from televoting.round_results rr
  where rr.round_id = target_round;

  if result_count = 0 then
    return;
  end if;

  if result_count <> 26 then
    raise exception 'SSC21 live round expected 26 recipient rows, found %', result_count;
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
  values (
    target_round::text,
    remote_edition::text,
    solaris_edition,
    target_show,
    'show',
    null,
    now(),
    now(),
    now()
  )
  on conflict (remote_round_id) do update
  set
    remote_edition_id = excluded.remote_edition_id,
    edition_id = excluded.edition_id,
    show_id = excluded.show_id,
    source_mode = 'show',
    updated_at = now();

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
    'Grand final live round',
    'live',
    3,
    null,
    rr.country_code,
    0,
    rr.original_votes,
    null,
    '{}'::jsonb,
    now()
  from televoting.round_results rr
  where rr.round_id = target_round;

  if (
    select count(*)
    from public.public_televote_country_contributions p
    where p.show_id = target_show
      and p.round_id = target_round::text
  ) <> 26 then
    raise exception 'SSC21 live-round public snapshot did not produce 26 recipient rows';
  end if;
end $$;
