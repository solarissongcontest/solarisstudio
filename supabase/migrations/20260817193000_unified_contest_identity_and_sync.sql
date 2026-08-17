begin;

alter table public.participants
  add column if not exists participation_status text not null default 'confirmed';

alter table public.participants
  drop constraint if exists participants_participation_status_check;

alter table public.participants
  add constraint participants_participation_status_check
  check (participation_status in ('pending','confirmed','waitlist','withdrawn','disqualified'));

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  contest_entity_id uuid references public.contest_entities(id) on delete set null,
  artist text,
  song_title text,
  song_url text,
  status text not null default 'pending' check (status in ('pending','confirmed','withdrawn','disqualified')),
  selection_method text,
  source text not null default 'solaris',
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, country_id)
);

create index if not exists entries_edition_idx on public.entries(edition_id);
create index if not exists entries_country_idx on public.entries(country_id);
create index if not exists entries_entity_idx on public.entries(contest_entity_id);

create table if not exists public.integration_links (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('confirmations','televoting')),
  entity_type text not null,
  solaris_id uuid not null,
  remote_id text not null,
  edition_id uuid references public.editions(id) on delete cascade,
  sync_status text not null default 'linked' check (sync_status in ('linked','pending','error')),
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service, entity_type, remote_id),
  unique (service, entity_type, solaris_id)
);

create index if not exists integration_links_edition_idx on public.integration_links(edition_id);
create index if not exists integration_links_status_idx on public.integration_links(sync_status);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('confirmations','televoting')),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  remote_id text,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text,
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists integration_events_status_idx on public.integration_events(status, next_attempt_at);
create index if not exists integration_events_entity_idx on public.integration_events(entity_type, entity_id);
create unique index if not exists integration_events_dedupe_idx
  on public.integration_events(service, event_type, payload_hash)
  where payload_hash is not null;

-- Backfill one canonical edition-level entry from existing participant data.
insert into public.entries (
  edition_id,
  country_id,
  contest_entity_id,
  artist,
  song_title,
  status,
  source,
  metadata
)
select distinct on (p.edition_id, p.country_id)
  p.edition_id,
  p.country_id,
  p.contest_entity_id,
  nullif(btrim(p.artist), ''),
  nullif(btrim(p.song), ''),
  'confirmed',
  'solaris',
  jsonb_build_object('backfilled_from', 'participants', 'participant_id', p.id)
from public.participants p
where p.country_id is not null
  and nullif(btrim(p.artist), '') is not null
  and nullif(btrim(p.song), '') is not null
order by p.edition_id, p.country_id, (p.show_id is null) desc, p.created_at
on conflict (edition_id, country_id) do nothing;

alter table public.entries enable row level security;
alter table public.integration_links enable row level security;
alter table public.integration_events enable row level security;

drop policy if exists "entries public read published" on public.entries;
create policy "entries public read published"
on public.entries for select
to anon, authenticated
using (
  exists (
    select 1 from public.editions e
    where e.id = entries.edition_id
      and (e.published = true or public.has_role((select auth.uid()), 'organizer'))
  )
);

drop policy if exists "entries organizer write" on public.entries;
create policy "entries organizer write"
on public.entries for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'))
with check (public.has_role((select auth.uid()), 'organizer'));

drop policy if exists "integration links organizer only" on public.integration_links;
create policy "integration links organizer only"
on public.integration_links for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'))
with check (public.has_role((select auth.uid()), 'organizer'));

drop policy if exists "integration events organizer only" on public.integration_events;
create policy "integration events organizer only"
on public.integration_events for all
to authenticated
using (public.has_role((select auth.uid()), 'organizer'))
with check (public.has_role((select auth.uid()), 'organizer'));

grant select on public.entries to anon, authenticated;
grant insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.integration_links to authenticated;
grant select, insert, update, delete on public.integration_events to authenticated;

commit;
