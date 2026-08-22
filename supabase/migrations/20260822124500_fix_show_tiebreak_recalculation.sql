create or replace function public.recalculate_show_results_internal(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _config jsonb;
  _jury_weight numeric;
  _tele_weight numeric;
  _weighted boolean;
  _updated integer := 0;
begin
  select coalesce(voting_config, '{}'::jsonb)
    into _config
  from public.shows
  where id = _show_id;

  if _config is null then return 0; end if;

  _weighted := coalesce((_config ->> 'weightedScoring')::boolean, false);
  _jury_weight := coalesce((_config -> 'weighting' ->> 'jury')::numeric, 50) / 50.0;
  _tele_weight := coalesce((_config -> 'weighting' ->> 'televote')::numeric, 50) / 50.0;

  with jury_scale as (
    select coalesce(max((value)::numeric), 12) as max_score
    from jsonb_array_elements_text(coalesce(_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb))
  ), point_counts as (
    select coalesce(j.receiving_country_id, j.receiving_entity_id) as identity_id,
           j.points::numeric as score,
           count(*)::numeric as cnt
    from public.jury_votes j
    where j.show_id = _show_id
    group by coalesce(j.receiving_country_id, j.receiving_entity_id), j.points
  ), jury_meta as (
    select pc.identity_id,
           coalesce(sum(pc.cnt) filter (where pc.score = js.max_score), 0)::numeric as top_awards,
           coalesce(sum(pc.cnt * power(1000::numeric, greatest(0, 20 - pc.score::integer))), 0)::numeric as countback_score
    from point_counts pc
    cross join jury_scale js
    group by pc.identity_id
  ), base as (
    select r.id, r.country_id, r.contest_entity_id,
           r.jury_points::numeric as jury_points,
           r.televote_points::numeric as televote_points,
           case when _weighted
             then round(r.jury_points * _jury_weight + r.televote_points * _tele_weight)::integer
             else (r.jury_points + r.televote_points)::integer
           end as total_points,
           r.final_rank as old_rank,
           p.running_order,
           coalesce(jm.top_awards, 0) as top_awards,
           coalesce(jm.countback_score, 0) as countback_score,
           coalesce(_config -> 'tieBreak', '["televote","twelves","jury"]'::jsonb) as tie_break
    from public.results r
    left join public.participants p
      on p.show_id = r.show_id
     and p.country_id is not distinct from r.country_id
     and p.contest_entity_id is not distinct from r.contest_entity_id
    left join jury_meta jm on jm.identity_id = coalesce(r.country_id, r.contest_entity_id)
    where r.show_id = _show_id
  ), keyed as (
    select b.*,
      case coalesce(b.tie_break ->> 0, '') when 'jury' then b.jury_points when 'televote' then b.televote_points when 'twelves' then b.top_awards when 'countback' then b.countback_score when 'runningOrder' then coalesce(b.running_order, -1)::numeric else 0 end as k0,
      case coalesce(b.tie_break ->> 1, '') when 'jury' then b.jury_points when 'televote' then b.televote_points when 'twelves' then b.top_awards when 'countback' then b.countback_score when 'runningOrder' then coalesce(b.running_order, -1)::numeric else 0 end as k1,
      case coalesce(b.tie_break ->> 2, '') when 'jury' then b.jury_points when 'televote' then b.televote_points when 'twelves' then b.top_awards when 'countback' then b.countback_score when 'runningOrder' then coalesce(b.running_order, -1)::numeric else 0 end as k2,
      case coalesce(b.tie_break ->> 3, '') when 'jury' then b.jury_points when 'televote' then b.televote_points when 'twelves' then b.top_awards when 'countback' then b.countback_score when 'runningOrder' then coalesce(b.running_order, -1)::numeric else 0 end as k3,
      case coalesce(b.tie_break ->> 4, '') when 'jury' then b.jury_points when 'televote' then b.televote_points when 'twelves' then b.top_awards when 'countback' then b.countback_score when 'runningOrder' then coalesce(b.running_order, -1)::numeric else 0 end as k4
    from base b
  ), ranked as (
    select k.id, k.total_points,
           row_number() over (
             order by k.total_points desc, k.k0 desc, k.k1 desc, k.k2 desc, k.k3 desc, k.k4 desc,
                      k.old_rank nulls last, k.country_id nulls last, k.contest_entity_id nulls last
           )::integer as new_rank
    from keyed k
  )
  update public.results r
  set total_points = ranked.total_points,
      final_rank = ranked.new_rank,
      updated_at = now()
  from ranked
  where r.id = ranked.id;

  get diagnostics _updated = row_count;
  return _updated;
end;
$$;

create or replace function public.admin_recalculate_show_results(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'organizer'::public.app_role) then
    raise exception 'Organizer access required';
  end if;
  return public.recalculate_show_results_internal(_show_id);
end;
$$;

grant execute on function public.admin_recalculate_show_results(uuid) to authenticated;
revoke all on function public.recalculate_show_results_internal(uuid) from public, anon, authenticated;

create or replace function public.rerank_results_after_voting_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.voting_config is distinct from new.voting_config then
    perform public.recalculate_show_results_internal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rerank_results_after_voting_config_change on public.shows;
create trigger trg_rerank_results_after_voting_config_change
after update of voting_config on public.shows
for each row
when (old.voting_config is distinct from new.voting_config)
execute function public.rerank_results_after_voting_config_change();

create or replace function public.materialize_show_results_if_missing(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _edition_id uuid;
  _existing integer;
  _inserted integer := 0;
begin
  select edition_id into _edition_id from public.shows where id = _show_id;
  if _edition_id is null then return 0; end if;

  select count(*) into _existing from public.results where show_id = _show_id;
  if _existing > 0 then return 0; end if;

  with jury as (
    select coalesce(receiving_country_id, receiving_entity_id) as identity_id,
           sum(points)::integer as jury_points
    from public.jury_votes
    where show_id = _show_id
    group by coalesce(receiving_country_id, receiving_entity_id)
  ), tele as (
    select coalesce(country_id, contest_entity_id) as identity_id,
           sum(points)::integer as televote_points
    from public.televote_votes
    where show_id = _show_id
    group by coalesce(country_id, contest_entity_id)
  )
  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, p.country_id, p.contest_entity_id,
         coalesce(j.jury_points, 0), coalesce(t.televote_points, 0),
         coalesce(j.jury_points, 0) + coalesce(t.televote_points, 0),
         null, now()
  from public.participants p
  left join jury j on j.identity_id = coalesce(p.country_id, p.contest_entity_id)
  left join tele t on t.identity_id = coalesce(p.country_id, p.contest_entity_id)
  where p.show_id = _show_id
    and coalesce(p.participation_status, 'confirmed') = 'confirmed';

  get diagnostics _inserted = row_count;
  perform public.recalculate_show_results_internal(_show_id);
  return _inserted;
end;
$$;

select public.recalculate_show_results_internal(id)
from public.shows
where exists (select 1 from public.results r where r.show_id = shows.id);