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

  select coalesce(array_agg(value::integer), array[]::integer[])
    into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config->'juryPoints', '[]'::jsonb)) value;

  v_top_score := coalesce(v_jury_scale[1], 12);

  insert into public.results (edition_id, show_id, country_id, jury_points, televote_points, total_points, final_rank)
  select distinct v_edition_id, _show_id, j.receiving_country_id, 0, 0, 0, null::integer
  from public.jury_votes j
  where j.show_id = _show_id and j.receiving_country_id is not null
  on conflict (show_id, country_id) where show_id is not null do nothing;

  insert into public.results (edition_id, show_id, contest_entity_id, jury_points, televote_points, total_points, final_rank)
  select distinct v_edition_id, _show_id, j.receiving_entity_id, 0, 0, 0, null::integer
  from public.jury_votes j
  where j.show_id = _show_id and j.receiving_country_id is null and j.receiving_entity_id is not null
  on conflict (show_id, contest_entity_id) where show_id is not null and contest_entity_id is not null do nothing;

  insert into public.results (edition_id, show_id, country_id, jury_points, televote_points, total_points, final_rank)
  select distinct v_edition_id, _show_id, t.country_id, 0, 0, 0, null::integer
  from public.televote_votes t
  where t.show_id = _show_id and t.country_id is not null
  on conflict (show_id, country_id) where show_id is not null do nothing;

  insert into public.results (edition_id, show_id, contest_entity_id, jury_points, televote_points, total_points, final_rank)
  select distinct v_edition_id, _show_id, t.contest_entity_id, 0, 0, 0, null::integer
  from public.televote_votes t
  where t.show_id = _show_id and t.country_id is null and t.contest_entity_id is not null
  on conflict (show_id, contest_entity_id) where show_id is not null and contest_entity_id is not null do nothing;

  with jury_sums as (
    select j.receiving_country_id as country_id,
           j.receiving_entity_id as entity_id,
           sum(j.points)::integer as jury_points,
           count(*) filter (where j.points = v_top_score)::integer as top_scores
    from public.jury_votes j
    where j.show_id = _show_id
      and (cardinality(v_jury_scale) = 0 or j.points = any(v_jury_scale))
    group by j.receiving_country_id, j.receiving_entity_id
  ),
  tele_sums as (
    select t.country_id,
           t.contest_entity_id as entity_id,
           sum(t.points)::integer as televote_points
    from public.televote_votes t
    where t.show_id = _show_id
    group by t.country_id, t.contest_entity_id
  ),
  scored as (
    select r.id,
           coalesce(js.jury_points, 0)::integer as jury_points,
           coalesce(ts.televote_points, 0)::integer as televote_points,
           coalesce(js.top_scores, 0)::integer as top_scores,
           coalesce((
             select p.running_order
             from public.participants p
             where p.edition_id = v_edition_id
               and ((r.country_id is not null and p.country_id = r.country_id)
                 or (r.contest_entity_id is not null and p.contest_entity_id = r.contest_entity_id))
             order by (p.show_id = _show_id) desc nulls last, p.updated_at desc
             limit 1
           ), -1)::integer as running_order
    from public.results r
    left join jury_sums js on
      (r.country_id is not null and js.country_id = r.country_id)
      or (r.contest_entity_id is not null and js.entity_id = r.contest_entity_id)
    left join tele_sums ts on
      (r.country_id is not null and ts.country_id = r.country_id)
      or (r.contest_entity_id is not null and ts.entity_id = r.contest_entity_id)
    where r.show_id = _show_id
  ),
  totals as (
    select s.*,
      case
        when coalesce((v_config->>'weightedScoring')::boolean, false) then
          round(s.jury_points * coalesce((v_config->'weighting'->>'jury')::numeric, 50) / 50
              + s.televote_points * coalesce((v_config->'weighting'->>'televote')::numeric, 50) / 50)::integer
        else s.jury_points + s.televote_points
      end as total_points
    from scored s
  ),
  ranked as (
    select t.*,
      row_number() over (
        order by t.total_points desc,
          array(
            select case rule.value
              when 'jury' then t.jury_points
              when 'televote' then t.televote_points
              when 'twelves' then t.top_scores
              when 'countback' then t.top_scores
              when 'runningOrder' then t.running_order
              else 0
            end
            from jsonb_array_elements_text(coalesce(v_config->'tieBreak', '["televote","twelves","jury"]'::jsonb))
              with ordinality as rule(value, ord)
            order by rule.ord
          ) desc,
          t.id
      )::integer as final_rank
    from totals t
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

create or replace function public.sync_results_after_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.sync_show_results_from_votes(coalesce(new.show_id, old.show_id));
  if tg_op = 'UPDATE' and new.show_id is distinct from old.show_id then
    perform public.sync_show_results_from_votes(old.show_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists jury_votes_sync_results on public.jury_votes;
create trigger jury_votes_sync_results
after insert or update or delete on public.jury_votes
for each row execute function public.sync_results_after_vote_change();

drop trigger if exists televote_votes_sync_results on public.televote_votes;
create trigger televote_votes_sync_results
after insert or update or delete on public.televote_votes
for each row execute function public.sync_results_after_vote_change();