create table if not exists televoting.historical_vote_observations (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  solaris_edition_id uuid not null references public.editions(id) on delete cascade,
  edition_number integer,
  round_key text not null,
  round_name text not null,
  voter_country_code text not null,
  target_country_code text not null,
  score integer not null check (score >= 0),
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  unique (source_key, voter_country_code, target_country_code)
);

create index if not exists historical_vote_observations_edition_idx
  on televoting.historical_vote_observations (solaris_edition_id, round_key);
create index if not exists historical_vote_observations_voter_idx
  on televoting.historical_vote_observations (voter_country_code, edition_number);
create index if not exists historical_vote_observations_target_idx
  on televoting.historical_vote_observations (target_country_code, edition_number);

alter table televoting.historical_vote_observations enable row level security;

revoke all on table televoting.historical_vote_observations from anon, authenticated;
grant all on table televoting.historical_vote_observations to service_role;

comment on table televoting.historical_vote_observations is
  'Exact historical country-level televote observations used for analytics when legacy ballot scales cannot be represented by the live vote_entries schema. Server/service-role only.';
