create table if not exists public.delegation_people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  identity_key text not null unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegation_people_identity_key_not_blank check (length(btrim(identity_key)) > 0),
  constraint delegation_people_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create table if not exists public.delegation_hod_assignments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  person_id uuid not null references public.delegation_people(id) on delete restrict,
  channel text not null default 'delegation',
  source text not null default 'manual',
  confidence integer not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegation_hod_assignments_channel_check check (channel in ('delegation','jury','televote')),
  constraint delegation_hod_assignments_confidence_check check (confidence between 0 and 100),
  unique (edition_id, country_id, channel)
);

create index if not exists delegation_hod_assignments_person_idx
  on public.delegation_hod_assignments(person_id, edition_id);
create index if not exists delegation_hod_assignments_country_idx
  on public.delegation_hod_assignments(country_id, edition_id);
create index if not exists delegation_hod_assignments_edition_idx
  on public.delegation_hod_assignments(edition_id, channel);

create trigger set_delegation_people_updated_at
before update on public.delegation_people
for each row execute function public.update_updated_at_column();

create trigger set_delegation_hod_assignments_updated_at
before update on public.delegation_hod_assignments
for each row execute function public.update_updated_at_column();

alter table public.delegation_people enable row level security;
alter table public.delegation_hod_assignments enable row level security;

comment on table public.delegation_people is
  'Canonical organizer-managed identities for Heads of Delegation across editions.';
comment on table public.delegation_hod_assignments is
  'Per-edition HOD ownership. delegation is the default controller; jury/televote rows override that channel when needed.';
comment on column public.delegation_hod_assignments.channel is
  'delegation = default HOD for both jury and televote unless a channel-specific override exists.';