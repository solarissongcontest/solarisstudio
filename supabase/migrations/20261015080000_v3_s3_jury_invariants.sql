begin;

-- System V3 S3: Jury invariants.
--
-- Jury already has mature V5 lifecycle commands and V3 reliability work. This
-- migration does not replace those owners. It audits the deployed shape first,
-- refuses to invent repairs for official vote evidence, stages row-local checks,
-- and then closes the remaining cross-table integrity gaps with deferred guards.
--
-- Hosted production was inspected read-only before this migration was authored:
-- legacy jury_votes are intentionally preserved without ballot_submission_id,
-- while the newer jury_ballot_submissions path currently has no production rows.

-- AUDIT: the existing final-ballot identity is already stronger than the V3
-- candidate invariant: one submission per show + delegation country. Keep that
-- owner and fail closed if a future branch silently removes or weakens it.
do $audit$
declare
  v_submission_identity_unique boolean;
begin
  select exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.jury_ballot_submissions'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (show_id, voter_country_id)'
  )
  into v_submission_identity_unique;

  if not v_submission_identity_unique then
    raise exception
      'Jury invariant audit failed: show/delegation final-ballot uniqueness is missing';
  end if;

  if exists (
    select 1
    from public.jury_voting_windows window_row
    join public.shows show_row on show_row.id = window_row.show_id
    where window_row.edition_id is distinct from show_row.edition_id
  ) then
    raise exception 'Jury invariant audit failed: voting window is outside show edition scope';
  end if;

  if exists (
    select 1
    from public.jury_voting_windows window_row
    group by window_row.edition_id
    having count(*) filter (where window_row.status = 'open') > 1
  ) then
    raise exception 'Jury invariant audit failed: more than one jury window is open for an edition';
  end if;

  if exists (
    select 1
    from public.jury_voting_windows window_row
    where (
      window_row.status = 'open'
      and (window_row.opened_at is null or window_row.closed_at is not null)
    ) or (
      window_row.status = 'closed'
      and window_row.opened_at is not null
      and (window_row.closed_at is null or window_row.closed_at < window_row.opened_at)
    )
  ) then
    raise exception 'Jury invariant audit failed: invalid voting-window lifecycle';
  end if;

  if exists (
    select 1
    from public.jury_ballot_submissions ballot
    join public.shows show_row on show_row.id = ballot.show_id
    where ballot.edition_id is distinct from show_row.edition_id
  ) then
    raise exception 'Jury invariant audit failed: ballot submission is outside show edition scope';
  end if;

  if exists (
    select 1
    from public.jury_ballot_submissions ballot
    join televoting.vote_preflight_checks preflight on preflight.id = ballot.preflight_id
    where preflight.channel is distinct from 'jury'
       or preflight.show_id is distinct from ballot.show_id
       or preflight.canonical_edition_id is distinct from ballot.edition_id
       or preflight.account_user_id is distinct from ballot.user_id
       or preflight.jury_ballot_submission_id is distinct from ballot.id
       or preflight.submitted_at is null
  ) then
    raise exception 'Jury invariant audit failed: ballot submission preflight scope mismatch';
  end if;

  if exists (
    select 1
    from public.jury_ballot_submissions ballot
    where ballot.review_version < 1
       or ballot.submitted_at > ballot.updated_at
       or (
         ballot.status = 'submitted'
         and (
           ballot.reviewed_at is not null
           or ballot.reviewed_by is not null
           or ballot.review_reason is not null
         )
       )
       or (
         ballot.status in ('valid', 'needs_review', 'invalidated', 'superseded')
         and (ballot.reviewed_at is null or ballot.reviewed_at < ballot.submitted_at)
       )
       or (
         ballot.status in ('needs_review', 'invalidated', 'superseded')
         and nullif(btrim(ballot.review_reason), '') is null
       )
  ) then
    raise exception 'Jury invariant audit failed: invalid ballot review lifecycle';
  end if;

  if exists (
    select 1
    from public.jury_votes vote
    join public.shows show_row on show_row.id = vote.show_id
    where vote.show_id is not null
      and vote.edition_id is distinct from show_row.edition_id
  ) then
    raise exception 'Jury invariant audit failed: vote is outside show edition scope';
  end if;

  if exists (
    select 1
    from public.jury_votes vote
    join public.jury_ballot_submissions ballot on ballot.id = vote.ballot_submission_id
    where vote.show_id is distinct from ballot.show_id
       or vote.edition_id is distinct from ballot.edition_id
       or vote.voter_country_id is distinct from ballot.voter_country_id
       or (
         ballot.voter_id is not null
         and vote.voter_id is distinct from ballot.voter_id
       )
       or (
         ballot.voter_entity_id is not null
         and vote.voter_entity_id is distinct from ballot.voter_entity_id
       )
  ) then
    raise exception 'Jury invariant audit failed: linked vote is outside ballot scope';
  end if;

  if exists (
    select 1
    from public.jury_ballot_statuses status_row
    join public.shows show_row on show_row.id = status_row.show_id
    where status_row.edition_id is distinct from show_row.edition_id
       or status_row.version < 1
       or status_row.changed_at < status_row.created_at
       or status_row.updated_at < status_row.created_at
  ) then
    raise exception 'Jury invariant audit failed: invalid did-not-vote state';
  end if;

  if exists (
    select 1
    from public.jury_ballot_statuses status_row
    join public.jury_ballot_submissions ballot
      on ballot.show_id = status_row.show_id
     and (
       (status_row.voter_id is not null and status_row.voter_id = ballot.voter_id)
       or (
         status_row.voter_entity_id is not null
         and status_row.voter_entity_id = ballot.voter_entity_id
       )
       or (
         status_row.voter_country_id is not null
         and status_row.voter_country_id = ballot.voter_country_id
       )
     )
    where status_row.status = 'did_not_vote'
  ) then
    raise exception 'Jury invariant audit failed: did-not-vote state coexists with a submitted ballot';
  end if;
end
$audit$;

-- STAGE -> VALIDATE row-local invariants. There is deliberately no automatic
-- mutation of official ballots or vote evidence in this migration.
alter table public.jury_voting_windows
  add constraint jury_voting_windows_lifecycle_v3_check
  check (
    (
      status = 'open'
      and opened_at is not null
      and closed_at is null
    )
    or (
      status = 'closed'
      and (
        opened_at is null
        or (closed_at is not null and closed_at >= opened_at)
      )
    )
  ) not valid;

alter table public.jury_ballot_submissions
  add constraint jury_ballot_submissions_review_lifecycle_v3_check
  check (
    review_version >= 1
    and submitted_at <= updated_at
    and (
      (
        status = 'submitted'
        and reviewed_at is null
        and reviewed_by is null
        and review_reason is null
      )
      or (
        status = 'valid'
        and reviewed_at is not null
        and reviewed_at >= submitted_at
      )
      or (
        status in ('needs_review', 'invalidated', 'superseded')
        and reviewed_at is not null
        and reviewed_at >= submitted_at
        and nullif(btrim(review_reason), '') is not null
      )
    )
  ) not valid;

alter table public.jury_ballot_statuses
  add constraint jury_ballot_statuses_timeline_v3_check
  check (
    version >= 1
    and changed_at >= created_at
    and updated_at >= created_at
  ) not valid;

alter table public.jury_voting_windows
  validate constraint jury_voting_windows_lifecycle_v3_check;
alter table public.jury_ballot_submissions
  validate constraint jury_ballot_submissions_review_lifecycle_v3_check;
alter table public.jury_ballot_statuses
  validate constraint jury_ballot_statuses_timeline_v3_check;

-- The command layer already closes another open show before opening a new one.
-- Make that domain rule impossible to bypass with a direct/legacy write.
create unique index jury_voting_windows_one_open_per_edition_v3_idx
  on public.jury_voting_windows (edition_id)
  where status = 'open';

create or replace function private.v3_validate_jury_window_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $validate$
declare
  v_show_edition_id uuid;
begin
  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_show_edition_id is null
     or v_show_edition_id is distinct from new.edition_id then
    raise exception 'Jury voting window must use the edition owned by its show'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_jury_window_scope()
  from public, anon, authenticated, service_role;

create trigger v3_s3_validate_jury_window_scope
before insert or update of show_id, edition_id
on public.jury_voting_windows
for each row execute function private.v3_validate_jury_window_scope();

-- Submission and preflight point at one another. Defer validation until commit
-- so the canonical submission function may insert ballot + votes and then bind
-- the already-run preflight without encountering a false intermediate failure.
create or replace function private.v3_validate_jury_submission_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, televoting
as $validate$
declare
  v_show_edition_id uuid;
  v_preflight televoting.vote_preflight_checks;
begin
  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_show_edition_id is null
     or v_show_edition_id is distinct from new.edition_id then
    raise exception 'Jury ballot submission must use the edition owned by its show'
      using errcode = '23514';
  end if;

  select preflight.*
  into v_preflight
  from televoting.vote_preflight_checks preflight
  where preflight.id = new.preflight_id;

  if v_preflight.id is null
     or v_preflight.channel is distinct from 'jury'
     or v_preflight.show_id is distinct from new.show_id
     or v_preflight.canonical_edition_id is distinct from new.edition_id
     or v_preflight.account_user_id is distinct from new.user_id
     or v_preflight.jury_ballot_submission_id is distinct from new.id
     or v_preflight.submitted_at is null then
    raise exception 'Jury ballot submission must bind to its exact completed integrity preflight'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.jury_ballot_statuses status_row
    where status_row.show_id = new.show_id
      and status_row.status = 'did_not_vote'
      and (
        (status_row.voter_id is not null and status_row.voter_id = new.voter_id)
        or (
          status_row.voter_entity_id is not null
          and status_row.voter_entity_id = new.voter_entity_id
        )
        or (
          status_row.voter_country_id is not null
          and status_row.voter_country_id = new.voter_country_id
        )
      )
  ) then
    raise exception 'A submitted jury ballot cannot coexist with did-not-vote state'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_jury_submission_scope()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_jury_submission_scope
after insert or update on public.jury_ballot_submissions
deferrable initially deferred
for each row execute function private.v3_validate_jury_submission_scope();

create or replace function private.v3_validate_jury_preflight_ballot_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, televoting
as $validate$
declare
  v_ballot public.jury_ballot_submissions;
begin
  if new.jury_ballot_submission_id is null then
    return new;
  end if;

  select ballot.*
  into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.id = new.jury_ballot_submission_id;

  if v_ballot.id is null
     or new.channel is distinct from 'jury'
     or new.id is distinct from v_ballot.preflight_id
     or new.show_id is distinct from v_ballot.show_id
     or new.canonical_edition_id is distinct from v_ballot.edition_id
     or new.account_user_id is distinct from v_ballot.user_id
     or new.submitted_at is null then
    raise exception 'Jury integrity preflight ballot link is outside its exact submission scope'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_jury_preflight_ballot_link()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_jury_preflight_ballot_link
after insert or update on televoting.vote_preflight_checks
deferrable initially deferred
for each row execute function private.v3_validate_jury_preflight_ballot_link();

-- Legacy jury_votes predate the V3 submission receipt path and intentionally
-- keep a null ballot_submission_id. Once a vote is linked to a modern ballot,
-- however, that relationship must be exact rather than merely FK-valid.
create or replace function private.v3_validate_jury_vote_ballot_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $validate$
declare
  v_ballot public.jury_ballot_submissions;
  v_show_edition_id uuid;
begin
  if new.show_id is not null then
    select show_row.edition_id
    into v_show_edition_id
    from public.shows show_row
    where show_row.id = new.show_id;

    if v_show_edition_id is null
       or v_show_edition_id is distinct from new.edition_id then
      raise exception 'Jury vote must use the edition owned by its show'
        using errcode = '23514';
    end if;
  end if;

  if new.ballot_submission_id is null then
    return new;
  end if;

  select ballot.*
  into v_ballot
  from public.jury_ballot_submissions ballot
  where ballot.id = new.ballot_submission_id;

  if v_ballot.id is null
     or new.show_id is distinct from v_ballot.show_id
     or new.edition_id is distinct from v_ballot.edition_id
     or new.voter_country_id is distinct from v_ballot.voter_country_id
     or (
       v_ballot.voter_id is not null
       and new.voter_id is distinct from v_ballot.voter_id
     )
     or (
       v_ballot.voter_entity_id is not null
       and new.voter_entity_id is distinct from v_ballot.voter_entity_id
     ) then
    raise exception 'Linked jury vote must remain inside its exact ballot scope'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_jury_vote_ballot_scope()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_jury_vote_ballot_scope
after insert or update on public.jury_votes
deferrable initially immediate
for each row execute function private.v3_validate_jury_vote_ballot_scope();

create or replace function private.v3_validate_jury_dnv_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $validate$
declare
  v_show_edition_id uuid;
begin
  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = new.show_id;

  if v_show_edition_id is null
     or v_show_edition_id is distinct from new.edition_id then
    raise exception 'Jury did-not-vote state must use the edition owned by its show'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.jury_ballot_submissions ballot
    where ballot.show_id = new.show_id
      and (
        (new.voter_id is not null and new.voter_id = ballot.voter_id)
        or (
          new.voter_entity_id is not null
          and new.voter_entity_id = ballot.voter_entity_id
        )
        or (
          new.voter_country_id is not null
          and new.voter_country_id = ballot.voter_country_id
        )
      )
  ) then
    raise exception 'Jury did-not-vote state cannot coexist with a submitted ballot'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_jury_dnv_scope()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_jury_dnv_scope
after insert or update on public.jury_ballot_statuses
deferrable initially deferred
for each row execute function private.v3_validate_jury_dnv_scope();

commit;
