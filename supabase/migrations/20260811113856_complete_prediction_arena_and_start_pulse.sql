-- ============================================================
-- CLEAN-REPLAY COMPATIBILITY SCAFFOLD
--
-- Historical production migration 20260811113856 was originally authored as
-- an additive migration on top of 20260812005000. Its timestamp sorts before
-- that foundation, however, which makes a clean Supabase replay fail before
-- the foundation has a chance to create the Prediction Arena tables.
--
-- Production databases that already recorded this migration do not rerun it.
-- For fresh databases, create the exact table shapes required by the later
-- August 11 Pulse migration. The canonical August 12 foundation then installs
-- Prediction RLS/grants/policies and submit_prediction, while the August 17
-- restore migrations install the scoring/sharing/follow/read runtime exactly
-- as deployed.
-- ============================================================

-- ------------------------------------------------------------
-- PREDICTION ARENA TABLE SCAFFOLD
-- Keep these definitions in sync with 20260812005000.
-- ------------------------------------------------------------

create table if not exists public.fan_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Solaris fan',
  visibility text not null default 'private'
    check (visibility in ('private', 'unlisted', 'public')),
  leaderboard_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(display_name) between 1 and 40)
);

create table if not exists public.prediction_rounds (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references public.shows(id) on delete cascade,
  opens_at timestamptz not null,
  locks_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'locked', 'scoring', 'scored', 'cancelled')),
  prediction_types text[] not null default array[
    'winner',
    'top_three',
    'jury_winner',
    'televote_winner'
  ]::text[],
  scoring_version text not null default 'v1',
  consensus_minimum integer not null default 5
    check (consensus_minimum between 3 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at < locks_at),
  check (
    prediction_types <@ array[
      'winner',
      'top_three',
      'top_ten',
      'qualifier',
      'jury_winner',
      'televote_winner',
      'full_ranking'
    ]::text[]
  )
);

create table if not exists public.prediction_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.prediction_rounds(id) on delete restrict,
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  state text not null default 'draft'
    check (state in ('draft', 'submitted', 'locked', 'scored')),
  submitted_at timestamptz,
  locked_at timestamptz,
  share_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, profile_id)
);

create table if not exists public.prediction_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.prediction_entries(id) on delete cascade,
  country_id uuid not null,
  prediction_type text not null
    check (prediction_type in (
      'winner',
      'top_three',
      'top_ten',
      'qualifier',
      'jury_winner',
      'televote_winner',
      'full_ranking'
    )),
  rank integer check (rank is null or rank > 0),
  confidence numeric(5,4) check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  ),
  created_at timestamptz not null default now(),
  unique (entry_id, prediction_type, country_id)
);

create table if not exists public.prediction_entry_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.prediction_entries(id) on delete cascade,
  version integer not null check (version > 0),
  payload jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (entry_id, version),
  check (jsonb_typeof(payload) = 'array')
);

create table if not exists public.prediction_scores (
  entry_id uuid primary key references public.prediction_entries(id) on delete cascade,
  score numeric(6,3) not null check (score between 0 and 100),
  percentile numeric(6,3) check (percentile is null or percentile between 0 and 100),
  breakdown jsonb not null default '{}'::jsonb,
  scoring_version text not null,
  scored_at timestamptz not null default now()
);

create unique index if not exists prediction_entries_share_token_idx
on public.prediction_entries (share_token)
where share_token is not null;

-- ------------------------------------------------------------
-- PHASE 3 TABLE SCAFFOLD
-- Required by 20260811160000_phase_3_solaris_pulse.sql.
-- Runtime policies and RPCs are restored later by 20260817203814.
-- ------------------------------------------------------------

create table if not exists public.fan_follows (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  entity_type text not null check (entity_type in ('country', 'edition', 'show')),
  entity_id uuid not null,
  notification_level text not null default 'important'
    check (notification_level in ('all', 'important', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, entity_type, entity_id)
);

create table if not exists public.content_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'entry_published',
    'running_order_published',
    'prediction_opened',
    'prediction_locked',
    'results_published',
    'record_broken',
    'story_published',
    'edition_update'
  )),
  entity_type text not null check (entity_type in ('country', 'edition', 'show')),
  entity_id uuid not null,
  title text not null check (char_length(title) between 1 and 140),
  summary text not null default '' check (char_length(summary) <= 400),
  route text not null check (route like '/%'),
  importance text not null default 'normal'
    check (importance in ('normal', 'important')),
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.fan_event_reads (
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  event_id uuid not null references public.content_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (profile_id, event_id)
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.fan_profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  categories text[] not null default array[
    'entries',
    'running_orders',
    'predictions',
    'results',
    'records'
  ]::text[],
  external_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (categories <@ array[
    'entries',
    'running_orders',
    'predictions',
    'results',
    'records'
  ]::text[])
);

create index if not exists fan_follows_profile_idx
on public.fan_follows (profile_id, created_at desc);

create index if not exists fan_follows_entity_idx
on public.fan_follows (entity_type, entity_id);

create index if not exists content_events_published_idx
on public.content_events (published_at desc);

comment on table public.prediction_entries is
  'Replay scaffold is completed by 20260812005000; share runtime is restored by 20260817203814.';

comment on table public.content_events is
  'Pulse replay scaffold extended by 20260811160000 and restored by 20260817203814.';
