create or replace function public.refresh_show_qualifiers(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_cutoff integer;
  v_has_ranked_results boolean;
begin
  select s.kind, s.qualifier_count
  into v_kind, v_cutoff
  from public.shows s
  where s.id = _show_id;

  if v_kind is distinct from 'semi-final' or coalesce(v_cutoff, 0) <= 0 then
    return;
  end if;

  select exists (
    select 1
    from public.results r
    where r.show_id = _show_id
      and r.final_rank is not null
  )
  into v_has_ranked_results;

  -- Before a semi-final has ranked results, organizers may still use the
  -- participant flag manually. Do not erase that state until official ranks
  -- actually exist. Once ranks exist, the configured qualifier count is the
  -- source of truth.
  if not v_has_ranked_results then
    return;
  end if;

  update public.participants p
  set qualified = exists (
    select 1
    from public.results r
    where r.show_id = _show_id
      and r.final_rank between 1 and v_cutoff
      and (
        (p.country_id is not null and r.country_id = p.country_id)
        or
        (p.contest_entity_id is not null and r.contest_entity_id = p.contest_entity_id)
      )
  )
  where p.show_id = _show_id;
end;
$$;

create or replace function public.sync_qualifiers_after_result_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_show_qualifiers(old.show_id);
    return old;
  end if;

  perform public.refresh_show_qualifiers(new.show_id);

  if tg_op = 'UPDATE' and old.show_id is distinct from new.show_id then
    perform public.refresh_show_qualifiers(old.show_id);
  end if;

  return new;
end;
$$;

drop trigger if exists results_sync_semi_final_qualifiers on public.results;
create trigger results_sync_semi_final_qualifiers
after insert or delete or update of show_id, country_id, contest_entity_id, final_rank
on public.results
for each row
execute function public.sync_qualifiers_after_result_change();

create or replace function public.sync_qualifiers_after_show_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_show_qualifiers(new.id);
  return new;
end;
$$;

drop trigger if exists shows_sync_semi_final_qualifiers on public.shows;
create trigger shows_sync_semi_final_qualifiers
after update of qualifier_count, kind
on public.shows
for each row
when (
  old.qualifier_count is distinct from new.qualifier_count
  or old.kind is distinct from new.kind
)
execute function public.sync_qualifiers_after_show_change();

-- Repair historical editions that already have ranked semi-final results but
-- predate automatic qualifier flag maintenance.
do $$
declare
  v_show record;
begin
  for v_show in
    select s.id
    from public.shows s
    where s.kind = 'semi-final'
      and coalesce(s.qualifier_count, 0) > 0
  loop
    perform public.refresh_show_qualifiers(v_show.id);
  end loop;
end;
$$;

grant execute on function public.refresh_show_qualifiers(uuid) to authenticated;
