begin;

alter table public.countries
  add column if not exists updated_at timestamptz not null default now();

alter table public.participants
  add column if not exists updated_at timestamptz not null default now();

-- Entries already had updated_at, but make direct organizer edits maintain it too.
drop trigger if exists update_countries_updated_at on public.countries;
create trigger update_countries_updated_at
before update on public.countries
for each row execute function public.update_updated_at_column();

drop trigger if exists update_participants_updated_at on public.participants;
create trigger update_participants_updated_at
before update on public.participants
for each row execute function public.update_updated_at_column();

drop trigger if exists update_entries_updated_at on public.entries;
create trigger update_entries_updated_at
before update on public.entries
for each row execute function public.update_updated_at_column();

commit;
