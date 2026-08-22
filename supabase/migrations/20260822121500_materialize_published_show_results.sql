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
  ), base as (
    select p.id as participant_id, p.edition_id, p.show_id, p.country_id, p.contest_entity_id,
           p.running_order,
           coalesce(j.jury_points, 0) as jury_points,
           coalesce(t.televote_points, 0) as televote_points,
           coalesce(j.jury_points, 0) + coalesce(t.televote_points, 0) as total_points
    from public.participants p
    left join jury j on j.identity_id = coalesce(p.country_id, p.contest_entity_id)
    left join tele t on t.identity_id = coalesce(p.country_id, p.contest_entity_id)
    where p.show_id = _show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  ), ranked as (
    select b.*,
           row_number() over (
             order by b.total_points desc, b.televote_points desc, b.jury_points desc,
                      b.running_order nulls last, b.participant_id
           )::integer as final_rank
    from base b
  )
  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select edition_id, show_id, country_id, contest_entity_id,
         jury_points, televote_points, total_points, final_rank, now()
  from ranked;

  get diagnostics _inserted = row_count;
  return _inserted;
end;
$$;

create or replace function public.materialize_results_on_show_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published = true
     and coalesce((new.publication_config->>'results')::boolean, false) = true
     and (
       tg_op = 'INSERT'
       or old.published is distinct from new.published
       or old.publication_config is distinct from new.publication_config
     )
  then
    perform public.materialize_show_results_if_missing(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_materialize_results_on_show_publish on public.shows;
create trigger trg_materialize_results_on_show_publish
after insert or update of published, publication_config on public.shows
for each row execute function public.materialize_results_on_show_publish();

grant execute on function public.materialize_show_results_if_missing(uuid) to authenticated;
