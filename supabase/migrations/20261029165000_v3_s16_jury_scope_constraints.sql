begin;

-- S16 Jury invariant hardening.
-- Replace trigger-enforced relational identity with declarative constraints
-- where PostgreSQL can enforce the rule in both directions.

create unique index if not exists v3_shows_id_edition_scope_uidx
  on public.shows (id, edition_id);
create unique index if not exists v3_jury_ballots_id_show_edition_uidx
  on public.jury_ballot_submissions (id, show_id, edition_id);

-- Existing S3 audits already fail closed on these mismatches. Keep a local
-- migration-time assertion so this cutover cannot bless dirty state.
do $audit$
begin
  if exists (
    select 1
    from public.jury_voting_windows jury_window
    join public.shows show_row on show_row.id = jury_window.show_id
    where jury_window.edition_id is distinct from show_row.edition_id
  ) then
    raise exception 'S16: Jury window/show edition mismatch blocks FK cutover';
  end if;

  if exists (
    select 1
    from public.jury_ballot_submissions ballot
    join public.shows show_row on show_row.id = ballot.show_id
    where ballot.edition_id is distinct from show_row.edition_id
  ) then
    raise exception 'S16: Jury ballot/show edition mismatch blocks FK cutover';
  end if;

  if exists (
    select 1
    from public.jury_votes vote
    join public.jury_ballot_submissions ballot
      on ballot.id = vote.ballot_submission_id
    where vote.ballot_submission_id is not null
      and (
        vote.show_id is distinct from ballot.show_id
        or vote.edition_id is distinct from ballot.edition_id
      )
  ) then
    raise exception 'S16: linked Jury vote/ballot scope mismatch blocks FK cutover';
  end if;
end;
$audit$;

alter table public.jury_voting_windows
  add constraint jury_voting_windows_show_edition_v3_fkey
  foreign key (show_id, edition_id)
  references public.shows(id, edition_id)
  on update restrict
  on delete cascade
  not valid;

alter table public.jury_ballot_submissions
  add constraint jury_ballot_submissions_show_edition_v3_fkey
  foreign key (show_id, edition_id)
  references public.shows(id, edition_id)
  on update restrict
  on delete cascade
  not valid;

alter table public.jury_votes
  add constraint jury_votes_ballot_scope_v3_fkey
  foreign key (ballot_submission_id, show_id, edition_id)
  references public.jury_ballot_submissions(id, show_id, edition_id)
  on update restrict
  on delete restrict
  not valid;

alter table public.jury_voting_windows
  validate constraint jury_voting_windows_show_edition_v3_fkey;
alter table public.jury_ballot_submissions
  validate constraint jury_ballot_submissions_show_edition_v3_fkey;
alter table public.jury_votes
  validate constraint jury_votes_ballot_scope_v3_fkey;

-- The declarative window/show FK owns the former scope check.
drop trigger if exists v3_s3_validate_jury_window_scope
  on public.jury_voting_windows;
create or replace function private.v3_validate_jury_window_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $retired$
begin
  raise exception 'Retired Jury window scope trigger must not be invoked'
    using errcode = '42501';
end
$retired$;
alter function private.v3_validate_jury_window_scope() owner to postgres;
revoke all on function private.v3_validate_jury_window_scope()
  from public, anon, authenticated, service_role;

-- The vote→ballot composite FK now blocks a ballot's show/edition from drifting
-- away from linked votes, so the reverse-reference trigger is redundant.
drop trigger if exists v3_guard_jury_ballot_reference_scope
  on public.jury_ballot_submissions;
create or replace function private.v3_guard_jury_ballot_reference_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $retired$
begin
  raise exception 'Retired Jury ballot reference guard must not be invoked'
    using errcode = '42501';
end
$retired$;
alter function private.v3_guard_jury_ballot_reference_scope() owner to postgres;
revoke all on function private.v3_guard_jury_ballot_reference_scope()
  from public, anon, authenticated, service_role;

do $proof$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.jury_voting_windows'::regclass
      and constraint_row.conname = 'jury_voting_windows_show_edition_v3_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.convalidated
  ) then
    raise exception 'S16: Jury window/show scope FK is missing or unvalidated';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.jury_votes'::regclass
      and constraint_row.conname = 'jury_votes_ballot_scope_v3_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.convalidated
  ) then
    raise exception 'S16: Jury vote/ballot reverse-scope FK is missing or unvalidated';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname in (
      'v3_s3_validate_jury_window_scope',
      'v3_guard_jury_ballot_reference_scope'
    )
      and trigger_row.tgrelid in (
        'public.jury_voting_windows'::regclass,
        'public.jury_ballot_submissions'::regclass
      )
      and not trigger_row.tgisinternal
  ) then
    raise exception 'S16: retired Jury scope trigger remains attached';
  end if;
end;
$proof$;

commit;
