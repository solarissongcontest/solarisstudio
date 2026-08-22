-- A semi-final result decides qualification. If an entry finishes inside the
-- configured top N, it qualified. Keep that fact identical on every participant
-- row for the same edition identity so public pages, analytics and final-lineup
-- tooling cannot disagree about the same country.

create or replace function public.refresh_edition_qualifications(_edition_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with ranked_semis as (
    select
      r.country_id,
      r.contest_entity_id,
      r.final_rank,
      coalesce(
        case
          when (s.voting_config ->> 'qualifiers') ~ '^[0-9]+$'
            then (s.voting_config ->> 'qualifiers')::integer
          else null
        end,
        s.qualifier_count,
        0
      ) as cutoff
    from public.results r
    join public.shows s on s.id = r.show_id
    where s.edition_id = _edition_id
      and s.kind = 'semi-final'
      and r.final_rank is not null
  ),
  outcomes as (
    select
      country_id,
      case when country_id is null then contest_entity_id else null end as custom_entity_id,
      bool_or(cutoff > 0 and final_rank between 1 and cutoff) as qualified
    from ranked_semis
    group by
      country_id,
      case when country_id is null then contest_entity_id else null end
  )
  update public.participants p
  set qualified = o.qualified
  from outcomes o
  where p.edition_id = _edition_id
    and (
      (o.country_id is not null and p.country_id = o.country_id)
      or
      (
        o.country_id is null
        and o.custom_entity_id is not null
        and p.country_id is null
        and p.contest_entity_id = o.custom_entity_id
      )
    )
    and p.qualified is distinct from o.qualified;
end;
$$;

-- Keep the existing public helper name, but make it refresh the whole edition.
-- Qualification is an edition-level fact even though the deciding result lives
-- on one semi-final stage row.
create or replace function public.refresh_show_qualifiers(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edition_id uuid;
begin
  select s.edition_id
  into v_edition_id
  from public.shows s
  where s.id = _show_id;

  if v_edition_id is not null then
    perform public.refresh_edition_qualifications(v_edition_id);
  end if;
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

-- Recreate so rank/identity/show changes always recalculate qualification.
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
  perform public.refresh_edition_qualifications(new.edition_id);
  return new;
end;
$$;

-- The qualifier number can be changed in either the dedicated column or the
-- voting-system JSON. Both must immediately recalculate the top-N outcome.
drop trigger if exists shows_sync_semi_final_qualifiers on public.shows;
create trigger shows_sync_semi_final_qualifiers
after update of qualifier_count, voting_config, kind
on public.shows
for each row
when (
  old.qualifier_count is distinct from new.qualifier_count
  or old.voting_config is distinct from new.voting_config
  or old.kind is distinct from new.kind
)
execute function public.sync_qualifiers_after_show_change();

-- Repair all existing editions now. This intentionally leaves direct finalists
-- with no ranked semi-final result untouched.
do $$
declare
  v_edition record;
begin
  for v_edition in
    select distinct s.edition_id
    from public.shows s
    where s.kind = 'semi-final'
  loop
    perform public.refresh_edition_qualifications(v_edition.edition_id);
  end loop;
end;
$$;

grant execute on function public.refresh_edition_qualifications(uuid) to authenticated;
grant execute on function public.refresh_show_qualifiers(uuid) to authenticated;
