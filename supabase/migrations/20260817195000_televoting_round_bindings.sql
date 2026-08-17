begin;

create table if not exists public.televoting_round_bindings (
  remote_round_id text primary key,
  remote_edition_id text not null,
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid references public.shows(id) on delete set null,
  source_mode text not null default 'edition' check (source_mode in ('edition','show')),
  last_synced_at timestamptz,
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists televoting_round_bindings_edition_idx on public.televoting_round_bindings(edition_id);
create index if not exists televoting_round_bindings_show_idx on public.televoting_round_bindings(show_id);

alter table public.televoting_round_bindings enable row level security;

drop policy if exists "televoting round bindings organizer only" on public.televoting_round_bindings;
create policy "televoting round bindings organizer only"
on public.televoting_round_bindings for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'))
with check (public.has_role((select auth.uid()), 'organizer'));

grant select, insert, update, delete on public.televoting_round_bindings to authenticated;

commit;
