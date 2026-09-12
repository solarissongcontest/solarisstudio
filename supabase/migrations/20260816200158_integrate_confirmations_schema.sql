begin;

-- Replay compatibility restoration.
--
-- Production records migration 20260816200158 (integrate_confirmations_schema),
-- but the corresponding repository migration disappeared from the checked-in
-- history. Later Solaris migrations assume these Confirmations tables already
-- exist. Recreate the original integration-era schema here so a fresh database
-- follows the same dependency order as the deployed database.
--
-- Keep this migration intentionally limited to the Confirmations foundation.
-- Later migrations continue to own historical-national-final columns,
-- publication state, next-in-line markers, result ordering, and other newer
-- Solaris behaviour.

create table if not exists public.submission_rounds (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  response_limit integer,
  created_at timestamptz not null default now(),
  editing_enabled boolean not null default true
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  round_id uuid not null references public.submission_rounds(id) on delete cascade,
  instagram_username text not null,
  country text not null,
  country_account text,
  has_country_account boolean not null default false,
  participating boolean not null default true,
  selection_method text,
  entry_unknown boolean not null default false,
  nf_entries_unknown boolean not null default false,
  reveal_date_type text,
  reveal_exact_date date,
  reveal_approximate_text text,
  nf_date_type text,
  nf_exact_date date,
  nf_approximate_text text,
  nf_result_date_type text,
  nf_result_exact_date date,
  nf_result_approximate_text text,
  editing_allowed boolean not null default false,
  locked boolean not null default false,
  reviewed boolean not null default false,
  admin_notes text,
  edit_count integer not null default 0,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  initial_ip text,
  latest_ip text,
  browser_session_id text,
  last_autosaved_at timestamptz,
  recovery_code text
);

create table if not exists public.internal_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  artist text,
  song_title text,
  song_url text,
  preview_start text,
  preview_end text,
  final_clip_start text,
  final_clip_end text,
  replacement_video_required boolean not null default false,
  replacement_video_url text,
  review_status text not null default 'pending',
  review_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  constraint internal_entries_review_status_check
    check (review_status in ('pending', 'accepted', 'declined'))
);

create table if not exists public.national_finals (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  nf_name text,
  expected_entry_count integer,
  winning_entry_id uuid
);

create table if not exists public.national_final_entries (
  id uuid primary key default gen_random_uuid(),
  national_final_id uuid not null references public.national_finals(id) on delete cascade,
  artist text,
  song_title text,
  song_url text,
  position integer not null default 0,
  review_status text not null default 'pending',
  review_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  removed boolean not null default false,
  removed_at timestamptz,
  preview_start text,
  preview_end text,
  final_clip_start text,
  final_clip_end text,
  replacement_video_required boolean not null default false,
  replacement_video_url text,
  constraint national_final_entries_review_status_check
    check (review_status in ('pending', 'accepted', 'declined', 'removed'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.national_finals'::regclass
      and conname = 'national_finals_winning_entry_id_fkey'
  ) then
    alter table public.national_finals
      add constraint national_finals_winning_entry_id_fkey
      foreign key (winning_entry_id)
      references public.national_final_entries(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.submission_versions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.submission_ip_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  ip_address text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (submission_id, ip_address)
);

create table if not exists public.submission_drafts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.submission_rounds(id) on delete cascade,
  browser_session_id text not null,
  payload jsonb not null default '{}'::jsonb,
  instagram_username text,
  country text,
  initial_ip text,
  latest_ip text,
  submitted_submission_id uuid references public.submissions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, browser_session_id)
);

create table if not exists public.edit_tokens (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  token_hash text not null unique,
  token_type text not null default 'reusable',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0
);

create table if not exists public.round_stats (
  round_id uuid primary key references public.submission_rounds(id) on delete cascade,
  submitted_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.submission_browser_sessions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  browser_session_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (submission_id, browser_session_id)
);

create table if not exists public.submission_review_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  target_type text not null,
  target_entry_id uuid,
  artist_snapshot text,
  song_title_snapshot text,
  action text not null,
  reason text not null,
  admin_user_id uuid,
  created_at timestamptz not null default now(),
  constraint submission_review_history_target_type_check
    check (target_type in ('internal', 'national_final')),
  constraint submission_review_history_action_check
    check (action in ('pending', 'accepted', 'declined', 'removed', 'winner_selected', 'winner_cleared'))
);

create table if not exists public.next_in_line_submissions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_submission_id uuid not null references public.submissions(id) on delete cascade,
  country text not null,
  participating boolean not null default true,
  entry_unknown boolean not null default false,
  selection_type text not null,
  national_final_entry_id uuid references public.national_final_entries(id) on delete set null,
  artist text,
  song_title text,
  song_url text,
  preview_start text,
  preview_end text,
  submitted_at timestamptz not null default now(),
  constraint next_in_line_submissions_selection_type_check
    check (selection_type in ('none', 'unknown', 'internal', 'national_final'))
);

create table if not exists public.next_in_line_responses (
  id uuid primary key default gen_random_uuid(),
  source_submission_id uuid not null references public.submissions(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  country text not null,
  participating boolean not null default true,
  selection_type text not null default 'unknown',
  entry_unknown boolean not null default false,
  national_final_entry_id uuid references public.national_final_entries(id) on delete set null,
  artist text,
  song_title text,
  song_url text,
  preview_start text,
  preview_end text,
  replacement_video_required boolean not null default false,
  replacement_video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint next_in_line_responses_selection_type_check
    check (selection_type in ('internal', 'national_final', 'unknown'))
);

-- These are exposed-schema tables. Keep RLS enabled from the moment the
-- historical foundation is replayed; later integration/runtime migrations own
-- the actual access policies and RPC surface.
alter table public.submission_rounds enable row level security;
alter table public.submissions enable row level security;
alter table public.internal_entries enable row level security;
alter table public.national_finals enable row level security;
alter table public.national_final_entries enable row level security;
alter table public.submission_versions enable row level security;
alter table public.submission_ip_history enable row level security;
alter table public.submission_drafts enable row level security;
alter table public.edit_tokens enable row level security;
alter table public.round_stats enable row level security;
alter table public.submission_browser_sessions enable row level security;
alter table public.submission_review_history enable row level security;
alter table public.next_in_line_submissions enable row level security;
alter table public.next_in_line_responses enable row level security;

commit;
