begin;

alter table public.editions
  add column if not exists data_revision bigint not null default 0;

alter table public.televoting_round_bindings
  add column if not exists last_synced_revision bigint not null default 0;

create or replace function public.bump_edition_data_revision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_edition_id uuid;
begin
  v_edition_id := case when tg_op = 'DELETE' then old.edition_id else new.edition_id end;
  if v_edition_id is not null then
    update public.editions
    set data_revision = data_revision + 1
    where id = v_edition_id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.bump_country_edition_revisions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.editions e
  set data_revision = e.data_revision + 1
  where exists (
    select 1
    from public.participants p
    where p.edition_id = e.id
      and p.country_id = new.id
  );
  return new;
end;
$$;

create or replace function public.capture_televoting_binding_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.last_synced_at is null then
    new.last_synced_revision := 0;
  else
    select e.data_revision into new.last_synced_revision
    from public.editions e
    where e.id = new.edition_id;
    new.last_synced_revision := coalesce(new.last_synced_revision, 0);
  end if;
  return new;
end;
$$;

drop trigger if exists participants_bump_edition_revision on public.participants;
create trigger participants_bump_edition_revision
after insert or update or delete on public.participants
for each row execute function public.bump_edition_data_revision();

drop trigger if exists entries_bump_edition_revision on public.entries;
create trigger entries_bump_edition_revision
after insert or update or delete on public.entries
for each row execute function public.bump_edition_data_revision();

drop trigger if exists countries_bump_edition_revision on public.countries;
create trigger countries_bump_edition_revision
after update on public.countries
for each row execute function public.bump_country_edition_revisions();

drop trigger if exists televoting_binding_capture_revision on public.televoting_round_bindings;
create trigger televoting_binding_capture_revision
before insert or update of last_synced_at, edition_id on public.televoting_round_bindings
for each row execute function public.capture_televoting_binding_revision();

-- Existing bindings predate revisions. Mark them stale once so the next safe
-- refresh establishes a trustworthy revision checkpoint.
update public.televoting_round_bindings
set last_synced_revision = 0;

commit;
