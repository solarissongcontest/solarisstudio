begin;

-- Canonical historical date for an SSC edition. This is the Grand Final date
-- (or the main event date for an edition without a Grand Final). It is kept
-- separate from `year` because anniversary history needs to know whether an
-- edition happened before or after 17 September, not merely its calendar year.
alter table public.editions
  add column if not exists event_date date;

comment on column public.editions.event_date is
  'Canonical edition event date: Grand Final date, or main event date if no Grand Final exists.';

create index if not exists editions_event_date_idx
  on public.editions (event_date)
  where event_date is not null;

-- SSC 1 is the canonical origin date. Later edition dates must be entered
-- explicitly rather than guessed from edition number or calendar year.
update public.editions
set event_date = date '2022-09-17',
    year = 2022
where edition_number = 1
  and event_date is null;

-- Keep the legacy display/filter year synchronized once an exact date exists.
create or replace function public.sync_edition_year_from_event_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.event_date is not null then
    new.year := extract(year from new.event_date)::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists editions_sync_year_from_event_date on public.editions;
create trigger editions_sync_year_from_event_date
before insert or update of event_date on public.editions
for each row execute function public.sync_edition_year_from_event_date();

commit;
