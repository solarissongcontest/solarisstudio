create or replace function public.sync_show_results_from_votes(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edition_id uuid;
  v_config jsonb;
  v_jury_scale integer[];
  v_top_score integer;
begin
  if _show_id is null then return; end if;

  select s.edition_id, coalesce(s.voting_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = _show_id;

  if v_edition_id is null then return; end if;

  select coalesce(array_agg(value::integer order by ord), array[]::integer[])
    into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config->'juryPoints', '[]'::jsonb))
       with ordinality as scale(value, ord);

  select coalesce(max(value), 12) into v_top_score
  from unnest(v_jury_scale) as value;

  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, p.country_id, p.contest_entity_id,
         0, 0, 0, null, now()
  from public.participants p
  where p.show_id = _show_id
    and p.country_id is not null
    and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  on conflict (show_id, country_id) where show_id is not null
  do update set
    edition_id = excluded.edition_id,
    contest_entity_id = coalesce(public.results.contest_entity_id, excluded.contest_entity_id),
    updated_at = now();

  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, null, p.contest_entity_id,
         0, 0, 0, null, now()
  from public.participants p
  where p.show_id = _show_id
    and p.country_id is null
    and p.contest_entity_id is not null
    and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  on conflict (show_id, contest_entity_id) where show_id is not null and contest_entity_id is not null
  do update set edition_id = excluded.edition_id, updated_at = now();

  update public.results r
  set final_rank = null,
      updated_at = now()
  where r.show_id = _show_id
    and not exists (
      select 1
      from public.participants p
      where p.show_id = _show_id
        and coalesce(p.participation_status, 'confirmed') = 'confirmed'
        and coalesce(p.country_id, p.contest_entity_id) = coalesce(r.country_id, r.contest_entity_id)
    );

  with jury_sums as (
    select coalesce(j.receiving_country_id, j.receiving_entity_id) as identity_id,
           sum(j.points)::integer as jury_points,
           count(*) filter (where j.points = v_top_score)::integer as top_scores
    from public.jury_votes j
    where j.show_id = _show_id
      and (cardinality(v_jury_scale) = 0 or j.points = any(v_jury_scale))
    group by coalesce(j.receiving_country_id, j.receiving_entity_id)
  ),
  tele_sums as (
    select coalesce(t.country_id, t.contest_entity_id) as identity_id,
           sum(t.points)::integer as televote_points
    from public.televote_votes t
    where t.show_id = _show_id
    group by coalesce(t.country_id, t.contest_entity_id)
  ),
  scored as (
    select r.id,
           coalesce(r.country_id, r.contest_entity_id) as identity_id,
           r.final_rank as old_rank,
           coalesce(js.jury_points, 0)::integer as jury_points,
           coalesce(ts.televote_points, 0)::integer as televote_points,
           coalesce(js.top_scores, 0)::integer as top_scores,
           coalesce(p.running_order, -1)::integer as running_order
    from public.results r
    join public.participants p
      on p.show_id = _show_id
     and coalesce(p.participation_status, 'confirmed') = 'confirmed'
     and coalesce(p.country_id, p.contest_entity_id) = coalesce(r.country_id, r.contest_entity_id)
    left join jury_sums js
      on js.identity_id = coalesce(r.country_id, r.contest_entity_id)
    left join tele_sums ts
      on ts.identity_id = coalesce(r.country_id, r.contest_entity_id)
    where r.show_id = _show_id
  ),
  totals as (
    select s.*,
      case
        when coalesce((v_config->>'weightedScoring')::boolean, false) then
          round(
            s.jury_points * coalesce((v_config->'weighting'->>'jury')::numeric, 50) / 50
            + s.televote_points * coalesce((v_config->'weighting'->>'televote')::numeric, 50) / 50
          )::integer
        else s.jury_points + s.televote_points
      end as total_points
    from scored s
  ),
  keyed as (
    select t.*,
      coalesce(v_config->'tieBreak', '["televote","twelves","jury"]'::jsonb) as tie_break
    from totals t
  ),
  ranked as (
    select k.*,
      row_number() over (
        order by
          k.total_points desc,
          case coalesce(k.tie_break->>0, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>1, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>2, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>3, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case coalesce(k.tie_break->>4, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores when 'countback' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          -- Historical imports can have an official ordering even when all configured
          -- tie-break values are identical. Keep that known order instead of letting
          -- an arbitrary UUID become the hidden final tie-break.
          k.old_rank nulls last,
          k.identity_id
      )::integer as final_rank
    from keyed k
  )
  update public.results r
  set jury_points = ranked.jury_points,
      televote_points = ranked.televote_points,
      total_points = ranked.total_points,
      final_rank = ranked.final_rank,
      updated_at = now()
  from ranked
  where r.id = ranked.id;
end;
$$;