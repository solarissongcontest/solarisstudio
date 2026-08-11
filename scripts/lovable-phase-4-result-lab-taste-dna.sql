-- ============================================================
-- SOLARIS STUDIO — PHASE 4: RESULT LAB + TASTE DNA
--
-- Run this AFTER the Phase 3 Solaris Pulse SQL has completed.
-- Result Lab itself is read-only and uses already-published voting data.
-- This migration adds the private fan ballot storage used by Taste DNA.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PRIVATE FAN TASTE BALLOTS
-- ------------------------------------------------------------

create table if not exists public.fan_taste_ballots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fan_profiles(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  ranking jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, show_id),
  check (jsonb_typeof(ranking) = 'array')
);

create index if not exists fan_taste_ballots_profile_updated_idx
on public.fan_taste_ballots (profile_id, updated_at desc);

create index if not exists fan_taste_ballots_show_idx
on public.fan_taste_ballots (show_id);

-- ------------------------------------------------------------
-- 2. BALLOT VALIDATION
--
-- A saved ranking must:
--   * contain at least three entries
--   * contain no duplicate entry IDs
--   * reference participants that actually belong to that show
--   * only be saved once the participant list is public
-- ------------------------------------------------------------

create or replace function public.validate_fan_taste_ballot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ranking_count integer;
  distinct_count integer;
  invalid_count integer;
begin
  if auth.uid() is not null and new.profile_id <> auth.uid() then
    raise exception 'Taste ballot owner does not match the signed-in user';
  end if;

  if not public.show_publication_enabled(new.show_id, 'participants') then
    raise exception 'This show is not available for Taste DNA yet';
  end if;

  if jsonb_typeof(new.ranking) <> 'array' then
    raise exception 'Taste ranking must be a JSON array';
  end if;

  select count(*)::integer,
         count(distinct ranked.entry_id)::integer
  into ranking_count, distinct_count
  from jsonb_array_elements_text(new.ranking) ranked(entry_id);

  if ranking_count < 3 then
    raise exception 'Rank at least three entries before saving Taste DNA';
  end if;

  if distinct_count <> ranking_count then
    raise exception 'Taste ranking contains duplicate entries';
  end if;

  select count(*)::integer
  into invalid_count
  from jsonb_array_elements_text(new.ranking) ranked(entry_id)
  where not exists (
    select 1
    from public.participants participant
    where participant.show_id = new.show_id
      and (
        participant.country_id::text = ranked.entry_id
        or participant.contest_entity_id::text = ranked.entry_id
      )
  );

  if invalid_count > 0 then
    raise exception 'Taste ranking contains an entry that does not belong to this show';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_fan_taste_ballot
on public.fan_taste_ballots;

create trigger trg_validate_fan_taste_ballot
before insert or update
on public.fan_taste_ballots
for each row
execute function public.validate_fan_taste_ballot();

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--
-- Taste ballots are private. There is intentionally no anonymous
-- SELECT policy and no public sharing table in Phase 4.
-- ------------------------------------------------------------

alter table public.fan_taste_ballots enable row level security;

drop policy if exists "Fans can read own taste ballots"
on public.fan_taste_ballots;

create policy "Fans can read own taste ballots"
on public.fan_taste_ballots
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "Fans can insert own taste ballots"
on public.fan_taste_ballots;

create policy "Fans can insert own taste ballots"
on public.fan_taste_ballots
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "Fans can update own taste ballots"
on public.fan_taste_ballots;

create policy "Fans can update own taste ballots"
on public.fan_taste_ballots
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "Fans can delete own taste ballots"
on public.fan_taste_ballots;

create policy "Fans can delete own taste ballots"
on public.fan_taste_ballots
for delete
to authenticated
using (profile_id = auth.uid());

revoke all on public.fan_taste_ballots from public, anon;
grant select, insert, update, delete on public.fan_taste_ballots to authenticated;
grant all on public.fan_taste_ballots to service_role;

comment on table public.fan_taste_ballots is
  'Private per-user rankings used to build Solaris Taste DNA. Rankings never become public automatically.';
