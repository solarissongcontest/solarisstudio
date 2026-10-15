begin;

-- System V3 S3: Televote invariants.
--
-- Preserve the existing Televoting domain and configured voting models. This
-- migration does not recalculate, rewrite, or normalize historical ballots.
-- It audits deployed evidence first, stages row-local checks, and then enforces
-- the remaining modern ballot scope/receipt relationships at the database edge.
--
-- Hosted production was inspected read-only before authoring this migration:
-- 149 submissions (53 historical), 1,572 vote entries, no active identity
-- duplicates, no modern identity/round-entry drift, no history-flag drift, and
-- no linked Televote preflight drift. No data repair is therefore appropriate.

do $audit$
declare
  v_identity_index regclass;
  v_identity_index_definition text;
  v_identity_index_predicate text;
begin
  v_identity_index := to_regclass('televoting.televoting_vs_round_username');
  if v_identity_index is null then
    raise exception 'Televote invariant audit failed: canonical round/username uniqueness index is missing';
  end if;

  select pg_get_indexdef(index_row.indexrelid),
         pg_get_expr(index_row.indpred, index_row.indrelid)
    into v_identity_index_definition, v_identity_index_predicate
  from pg_catalog.pg_index index_row
  where index_row.indexrelid = v_identity_index
    and index_row.indisunique;

  if v_identity_index_definition is null
     or v_identity_index_definition not like '%(round_id, username_normalized)%'
     or v_identity_index_predicate is null
     or v_identity_index_predicate not like '%status <> ''deleted''%' then
    raise exception 'Televote invariant audit failed: canonical round/username uniqueness index is weaker than expected';
  end if;

  if exists (
    select 1
    from televoting.vote_submissions submission
    where submission.status <> 'deleted'
    group by submission.round_id, submission.username_normalized
    having count(*) > 1
  ) then
    raise exception 'Televote invariant audit failed: duplicate active canonical ballots exist';
  end if;

  if exists (
    select 1
    from televoting.vote_submissions submission
    where not submission.is_historical
      and (
        length(btrim(submission.username)) < 2
        or submission.username_normalized is distinct from lower(btrim(submission.username))
      )
  ) then
    raise exception 'Televote invariant audit failed: modern ballot identity is not normalized';
  end if;

  if exists (
    select 1
    from televoting.vote_submissions submission
    where not submission.is_historical
      and not exists (
        select 1
        from televoting.countries country
        where country.code = submission.country_code
      )
  ) then
    raise exception 'Televote invariant audit failed: modern ballot uses an unknown home country';
  end if;

  if exists (
    select 1
    from televoting.vote_entries vote_entry
    join televoting.vote_submissions submission
      on submission.id = vote_entry.submission_id
    where vote_entry.is_historical is distinct from submission.is_historical
  ) then
    raise exception 'Televote invariant audit failed: vote-entry history classification differs from its ballot';
  end if;

  if exists (
    select 1
    from televoting.vote_entries vote_entry
    join televoting.vote_submissions submission
      on submission.id = vote_entry.submission_id
    where not submission.is_historical
      and not exists (
        select 1
        from televoting.round_entries round_entry
        where round_entry.round_id = submission.round_id
          and round_entry.entry_key = vote_entry.target_country_code
      )
  ) then
    raise exception 'Televote invariant audit failed: modern vote entry is outside its ballot round';
  end if;

  if exists (
    select 1
    from televoting.vote_preflight_checks preflight
    where preflight.channel = 'televote'
      and (
        (preflight.submission_id is null) <> (preflight.submitted_at is null)
        or (
          preflight.submission_id is not null
          and not exists (
            select 1
            from televoting.vote_submissions submission
            where submission.id = preflight.submission_id
              and not submission.is_historical
              and submission.round_id is not distinct from preflight.round_id
              and submission.username_normalized is not distinct from preflight.username_normalized
              and upper(submission.country_code) is not distinct from upper(preflight.country_code)
          )
        )
      )
  ) then
    raise exception 'Televote invariant audit failed: completed preflight is outside its exact modern ballot scope';
  end if;

  if exists (
    select 1
    from televoting.vote_preflight_checks preflight
    where preflight.channel = 'televote'
      and preflight.submission_id is not null
    group by preflight.submission_id
    having count(*) > 1
  ) then
    raise exception 'Televote invariant audit failed: one ballot is linked to multiple completed preflights';
  end if;
end
$audit$;

-- STAGE -> VALIDATE only row-local rules. Historical ballots remain exempt from
-- modern identity normalization; their imported evidence is not rewritten.
alter table televoting.vote_submissions
  add constraint vote_submissions_modern_identity_v3_check
  check (
    is_historical
    or (
      length(btrim(username)) >= 2
      and username_normalized = lower(btrim(username))
    )
  ) not valid;

alter table televoting.vote_preflight_checks
  add constraint vote_preflight_checks_televote_binding_state_v3_check
  check (
    channel <> 'televote'
    or (
      (submission_id is null and submitted_at is null)
      or (submission_id is not null and submitted_at is not null)
    )
  ) not valid;

alter table televoting.vote_submissions
  validate constraint vote_submissions_modern_identity_v3_check;
alter table televoting.vote_preflight_checks
  validate constraint vote_preflight_checks_televote_binding_state_v3_check;

-- A submitted modern ballot has one receipt-bearing integrity preflight. Keep
-- the existing round+username ballot identity index as the configured duplicate
-- authority; this index only makes the receipt relationship one-to-one.
create unique index vote_preflight_checks_televote_submission_v3_idx
  on televoting.vote_preflight_checks (submission_id)
  where channel = 'televote' and submission_id is not null;

create or replace function private.v3_guard_televote_submission_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $guard$
begin
  if not new.is_historical then
    if length(btrim(new.username)) < 2
       or new.username_normalized is distinct from lower(btrim(new.username)) then
      raise exception 'Modern Televote ballot identity must use the normalized submitted username'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from televoting.countries country
      where country.code = new.country_code
    ) then
      raise exception 'Modern Televote ballot must use a known voting country'
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1
    from televoting.vote_entries vote_entry
    where vote_entry.submission_id = new.id
      and vote_entry.is_historical is distinct from new.is_historical
  ) then
    raise exception 'Televote ballot history classification cannot drift from its vote entries'
      using errcode = '23514';
  end if;

  if not new.is_historical and exists (
    select 1
    from televoting.vote_entries vote_entry
    where vote_entry.submission_id = new.id
      and not exists (
        select 1
        from televoting.round_entries round_entry
        where round_entry.round_id = new.round_id
          and round_entry.entry_key = vote_entry.target_country_code
      )
  ) then
    raise exception 'Modern Televote ballot cannot move outside the scope of its vote entries'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from televoting.vote_preflight_checks preflight
    where preflight.channel = 'televote'
      and preflight.submission_id = new.id
      and (
        new.is_historical
        or preflight.round_id is distinct from new.round_id
        or preflight.username_normalized is distinct from new.username_normalized
        or upper(preflight.country_code) is distinct from upper(new.country_code)
        or preflight.submitted_at is null
      )
  ) then
    raise exception 'Televote ballot identity cannot drift from its completed integrity preflight'
      using errcode = '23514';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_televote_submission_identity()
  from public, anon, authenticated, service_role;

create trigger v3_s3_guard_televote_submission_identity
before insert or update of round_id, username, username_normalized, country_code, is_historical
on televoting.vote_submissions
for each row execute function private.v3_guard_televote_submission_identity();

create or replace function private.v3_guard_televote_entry_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $guard$
declare
  v_submission televoting.vote_submissions;
begin
  select submission.*
    into v_submission
  from televoting.vote_submissions submission
  where submission.id = new.submission_id;

  if v_submission.id is null then
    raise exception 'Televote vote entry must reference an existing ballot'
      using errcode = '23503';
  end if;

  if new.is_historical is distinct from v_submission.is_historical then
    raise exception 'Televote vote entry must preserve its ballot history classification'
      using errcode = '23514';
  end if;

  if not v_submission.is_historical and not exists (
    select 1
    from televoting.round_entries round_entry
    where round_entry.round_id = v_submission.round_id
      and round_entry.entry_key = new.target_country_code
  ) then
    raise exception 'Modern Televote vote entry must belong to its ballot round'
      using errcode = '23514';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_televote_entry_scope()
  from public, anon, authenticated, service_role;

create trigger v3_s3_guard_televote_entry_scope
before insert or update of submission_id, target_country_code, is_historical
on televoting.vote_entries
for each row execute function private.v3_guard_televote_entry_scope();

-- Canonical submit_vote_checked inserts the submission + entries and finally
-- binds the already-created preflight. Validate the final relationship at the
-- transaction boundary instead of rejecting a harmless intermediate state.
create or replace function private.v3_validate_televote_preflight_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $validate$
declare
  v_submission televoting.vote_submissions;
begin
  if new.channel <> 'televote' then
    return new;
  end if;

  if new.submission_id is null then
    if new.submitted_at is not null then
      raise exception 'Unused Televote integrity preflight cannot claim submission completion'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select submission.*
    into v_submission
  from televoting.vote_submissions submission
  where submission.id = new.submission_id;

  if v_submission.id is null
     or v_submission.is_historical
     or new.submitted_at is null
     or new.round_id is distinct from v_submission.round_id
     or new.username_normalized is distinct from v_submission.username_normalized
     or upper(new.country_code) is distinct from upper(v_submission.country_code) then
    raise exception 'Completed Televote integrity preflight must bind its exact modern ballot identity'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_televote_preflight_link()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_televote_preflight_link
after insert or update on televoting.vote_preflight_checks
deferrable initially deferred
for each row execute function private.v3_validate_televote_preflight_link();

commit;
