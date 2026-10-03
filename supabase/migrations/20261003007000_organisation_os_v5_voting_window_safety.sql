begin;

-- Organisation OS V5: R2 live-voting control contracts.
--
-- The Organizer UI already requires preview -> typed confirmation for Televote
-- round state and Jury window state. This migration supplies the missing
-- server-authoritative preview/apply RPCs and version clocks behind that UI.

-- ============================================================
-- Televote round-state version clocks
-- ============================================================

create table if not exists televoting.studio2_round_control_state (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

insert into televoting.studio2_round_control_state (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists televoting.studio2_round_versions (
  round_id uuid primary key references televoting.rounds(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

insert into televoting.studio2_round_versions (round_id)
select round_row.id
from televoting.rounds round_row
on conflict (round_id) do nothing;

alter table televoting.studio2_round_control_state enable row level security;
alter table televoting.studio2_round_versions enable row level security;
revoke all on table televoting.studio2_round_control_state from public, anon, authenticated;
revoke all on table televoting.studio2_round_versions from public, anon, authenticated;
grant all on table televoting.studio2_round_control_state to service_role;
grant all on table televoting.studio2_round_versions to service_role;

create or replace function televoting.studio2_bump_round_version(
  p_round_id uuid,
  p_global boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $bump$
begin
  if p_round_id is not null then
    insert into televoting.studio2_round_versions as round_version (
      round_id,
      version,
      updated_at
    )
    values (p_round_id, 2, now())
    on conflict (round_id) do update set
      version = round_version.version + 1,
      updated_at = now();
  end if;

  if p_global then
    update televoting.studio2_round_control_state
    set version = version + 1, updated_at = now()
    where singleton = true;
  end if;
end
$bump$;

revoke all on function televoting.studio2_bump_round_version(uuid, boolean)
  from public, anon, authenticated;

create or replace function televoting.studio2_guard_round_status_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $guard$
declare
  v_request_role text := coalesce(auth.jwt() ->> 'role', '');
  v_trusted_server boolean := v_request_role = '' or v_request_role = 'service_role';
  v_r2_allowed boolean := coalesce(
    current_setting('solaris.televote_round_r2', true),
    ''
  ) = 'allowed';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and not v_trusted_server and not v_r2_allowed then
      raise exception 'Live Televote status changes require the R2 round-state command.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' and not v_trusted_server and not v_r2_allowed then
      raise exception 'Only a draft Televote round can be deleted directly.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status is distinct from new.status
     and not v_trusted_server
     and not v_r2_allowed then
    raise exception 'Live Televote status changes require the R2 round-state command.'
      using errcode = '42501';
  end if;

  return new;
end
$guard$;

revoke all on function televoting.studio2_guard_round_status_mutation()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_round_status_mutation
  on televoting.rounds;
create trigger studio2_guard_round_status_mutation
before insert or update or delete on televoting.rounds
for each row execute function televoting.studio2_guard_round_status_mutation();

create or replace function televoting.studio2_round_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $version$
declare
  v_round_id uuid;
  v_global boolean := false;
  v_relevant boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into televoting.studio2_round_versions (round_id)
    values (new.id)
    on conflict (round_id) do nothing;
    if new.status = 'open' then
      perform televoting.studio2_bump_round_version(new.id, true);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'open' then
      update televoting.studio2_round_control_state
      set version = version + 1, updated_at = now()
      where singleton = true;
    end if;
    return old;
  end if;

  v_round_id := new.id;
  v_global := old.status is distinct from new.status;
  v_relevant :=
    v_global
    or old.results_status is distinct from new.results_status
    or old.calculation_version is distinct from new.calculation_version
    or old.results_outdated is distinct from new.results_outdated
    or old.participant_mode is distinct from new.participant_mode
    or old.self_voting_mode is distinct from new.self_voting_mode
    or old.total_points_to_distribute is distinct from new.total_points_to_distribute
    or old.rank_exponent is distinct from new.rank_exponent;

  if v_relevant then
    perform televoting.studio2_bump_round_version(v_round_id, v_global);
  end if;

  return new;
end
$version$;

revoke all on function televoting.studio2_round_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_round_version_trigger
  on televoting.rounds;
create trigger studio2_round_version_trigger
after insert or update or delete on televoting.rounds
for each row execute function televoting.studio2_round_version_trigger();

create or replace function televoting.studio2_round_entries_guard_and_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $entries$
declare
  v_old_round uuid;
  v_new_round uuid;
  v_status televoting.round_status;
begin
  if tg_op <> 'INSERT' then v_old_round := old.round_id; end if;
  if tg_op <> 'DELETE' then v_new_round := new.round_id; end if;

  if v_old_round is not null then
    perform televoting.studio2_bump_round_version(v_old_round, false);
  end if;
  if v_new_round is not null and v_new_round is distinct from v_old_round then
    perform televoting.studio2_bump_round_version(v_new_round, false);
  elsif tg_op = 'INSERT' and v_new_round is not null then
    perform televoting.studio2_bump_round_version(v_new_round, false);
  end if;

  if v_old_round is not null then
    select round_row.status into v_status
    from televoting.rounds round_row
    where round_row.id = v_old_round;
    if v_status = 'open' then
      raise exception 'Close voting before changing the live round line-up.'
        using errcode = '23514';
    end if;
  end if;

  if v_new_round is not null and v_new_round is distinct from v_old_round then
    select round_row.status into v_status
    from televoting.rounds round_row
    where round_row.id = v_new_round;
    if v_status = 'open' then
      raise exception 'Close voting before changing the live round line-up.'
        using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' and v_new_round is not null then
    select round_row.status into v_status
    from televoting.rounds round_row
    where round_row.id = v_new_round;
    if v_status = 'open' then
      raise exception 'Close voting before changing the live round line-up.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$entries$;

revoke all on function televoting.studio2_round_entries_guard_and_version()
  from public, anon, authenticated;

drop trigger if exists studio2_round_entries_version_trigger
  on televoting.round_entries;
create trigger studio2_round_entries_version_trigger
before insert or update or delete on televoting.round_entries
for each row execute function televoting.studio2_round_entries_guard_and_version();

create or replace function televoting.studio2_vote_submission_guard_and_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $ballot$
declare
  v_old_round uuid;
  v_new_round uuid;
  v_status televoting.round_status;
begin
  if tg_op <> 'INSERT' then v_old_round := old.round_id; end if;
  if tg_op <> 'DELETE' then v_new_round := new.round_id; end if;

  if v_old_round is not null then
    perform televoting.studio2_bump_round_version(v_old_round, false);
  end if;
  if v_new_round is not null and v_new_round is distinct from v_old_round then
    perform televoting.studio2_bump_round_version(v_new_round, false);
  elsif tg_op = 'INSERT' and v_new_round is not null then
    perform televoting.studio2_bump_round_version(v_new_round, false);
  end if;

  if tg_op = 'INSERT' then
    select round_row.status into v_status
    from televoting.rounds round_row
    where round_row.id = new.round_id;
    if v_status is distinct from 'open'::televoting.round_status then
      raise exception 'This voting round is no longer open.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$ballot$;

revoke all on function televoting.studio2_vote_submission_guard_and_version()
  from public, anon, authenticated;

drop trigger if exists studio2_vote_submissions_version_trigger
  on televoting.vote_submissions;
create trigger studio2_vote_submissions_version_trigger
before insert or update or delete on televoting.vote_submissions
for each row execute function televoting.studio2_vote_submission_guard_and_version();

create or replace function public.studio2_televote_binding_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, televoting
as $binding$
declare
  v_old_round uuid;
  v_new_round uuid;
  v_uuid_pattern text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if tg_op = 'UPDATE'
     and old.remote_round_id is not distinct from new.remote_round_id
     and old.remote_edition_id is not distinct from new.remote_edition_id
     and old.edition_id is not distinct from new.edition_id
     and old.show_id is not distinct from new.show_id
     and old.source_mode is not distinct from new.source_mode
     and old.frozen_at is not distinct from new.frozen_at then
    return new;
  end if;

  if tg_op <> 'INSERT' and old.remote_round_id ~* v_uuid_pattern then
    v_old_round := old.remote_round_id::uuid;
  end if;
  if tg_op <> 'DELETE' and new.remote_round_id ~* v_uuid_pattern then
    v_new_round := new.remote_round_id::uuid;
  end if;

  if v_old_round is not null then
    perform televoting.studio2_bump_round_version(v_old_round, false);
  end if;
  if v_new_round is not null and v_new_round is distinct from v_old_round then
    perform televoting.studio2_bump_round_version(v_new_round, false);
  elsif tg_op = 'INSERT' and v_new_round is not null then
    perform televoting.studio2_bump_round_version(v_new_round, false);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$binding$;

revoke all on function public.studio2_televote_binding_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_televote_binding_version_trigger
  on public.televoting_round_bindings;
create trigger studio2_televote_binding_version_trigger
after insert or update or delete on public.televoting_round_bindings
for each row execute function public.studio2_televote_binding_version_trigger();

create or replace function televoting.studio2_round_status_payload(
  p_round_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $payload$
declare
  v_round televoting.rounds;
  v_binding public.televoting_round_bindings;
  v_remote_edition televoting.editions;
  v_global_version bigint;
  v_round_version bigint;
  v_entry_count integer;
  v_ballot_count integer;
  v_suspicious_count integer;
  v_other_open televoting.rounds;
  v_blockers text[] := array[]::text[];
begin
  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid Televote round status' using errcode = '22023';
  end if;

  select *
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select *
  into v_binding
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;

  if v_binding.remote_round_id is null then
    raise exception 'Voting round is not linked to a Solaris edition' using errcode = '23514';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_binding.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  select *
  into v_remote_edition
  from televoting.editions edition_row
  where edition_row.id = v_round.edition_id;

  if v_remote_edition.id is null then
    raise exception 'Voting edition not found' using errcode = 'P0002';
  end if;

  select control.version
  into v_global_version
  from televoting.studio2_round_control_state control
  where control.singleton = true;

  insert into televoting.studio2_round_versions (round_id)
  values (p_round_id)
  on conflict (round_id) do nothing;

  select round_version.version
  into v_round_version
  from televoting.studio2_round_versions round_version
  where round_version.round_id = p_round_id;

  select count(*)::integer
  into v_entry_count
  from televoting.round_entries entry
  where entry.round_id = p_round_id;

  select
    count(*) filter (where submission.status <> 'deleted')::integer,
    count(*) filter (where submission.status = 'suspicious')::integer
  into v_ballot_count, v_suspicious_count
  from televoting.vote_submissions submission
  where submission.round_id = p_round_id;

  select *
  into v_other_open
  from televoting.rounds other_round
  where other_round.status = 'open'
    and other_round.id <> p_round_id
  order by other_round.opened_at desc nulls last, other_round.created_at desc
  limit 1;

  if p_status = 'open' then
    if coalesce(v_remote_edition.is_archived, false) then
      v_blockers := array_append(v_blockers, 'Archived editions cannot open public voting.');
    end if;
    if v_entry_count < 2 or v_entry_count > 50 then
      v_blockers := array_append(
        v_blockers,
        'Voting requires between 2 and 50 round entries.'
      );
    end if;
    if v_other_open.id is not null then
      v_blockers := array_append(
        v_blockers,
        'Another public voting round is already open.'
      );
    end if;
    if v_round.results_status in ('locked', 'published') then
      v_blockers := array_append(
        v_blockers,
        'Unlock or unpublish the existing round result before reopening voting.'
      );
    end if;
  elsif p_status = 'draft' then
    if v_ballot_count > 0 then
      v_blockers := array_append(
        v_blockers,
        'A round with stored ballots cannot return to draft.'
      );
    end if;
    if v_round.calculation_version > 0 then
      v_blockers := array_append(
        v_blockers,
        'A round with calculated results cannot return to draft.'
      );
    end if;
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_binding.edition_id,
    'requestedStatus', p_status,
    'currentStatus', v_round.status::text,
    'expectedGlobalVersion', coalesce(v_global_version, 1),
    'expectedRoundVersion', coalesce(v_round_version, 1),
    'entryCount', coalesce(v_entry_count, 0),
    'ballotCount', coalesce(v_ballot_count, 0),
    'suspiciousBallotCount', coalesce(v_suspicious_count, 0),
    'resultsStatus', v_round.results_status,
    'calculationVersion', v_round.calculation_version,
    'resultsOutdated', v_round.results_outdated,
    'otherOpenRound',
      case
        when v_other_open.id is null then null
        else jsonb_build_object(
          'roundId', v_other_open.id,
          'roundName', v_other_open.name,
          'editionId', v_other_open.edition_id
        )
      end,
    'blockers', to_jsonb(v_blockers),
    'alreadyApplied', v_round.status::text = p_status
  );
end
$payload$;

revoke all on function televoting.studio2_round_status_payload(uuid, text)
  from public, anon, authenticated;

create or replace function televoting.studio2_round_status_change_preview(
  p_round_id uuid,
  p_status text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, televoting
as $preview$
  select televoting.studio2_round_status_payload(p_round_id, p_status);
$preview$;

revoke all on function televoting.studio2_round_status_change_preview(uuid, text)
  from public, anon;
grant execute on function televoting.studio2_round_status_change_preview(uuid, text)
  to authenticated, service_role;

create or replace function televoting.studio2_apply_round_status_change(
  p_round_id uuid,
  p_status text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_global_version bigint,
  p_expected_round_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $apply$
declare
  v_round televoting.rounds;
  v_binding public.televoting_round_bindings;
  v_preview jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_global_version bigint;
  v_round_version bigint;
  v_result jsonb;
  v_actor uuid := auth.uid();
  v_actor_label text := coalesce(auth.jwt() ->> 'email', 'Solaris organizer');
begin
  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid Televote round status' using errcode = '22023';
  end if;

  select *
  into v_binding
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text
  for update;

  if v_binding.remote_round_id is null then
    raise exception 'Voting round is not linked to a Solaris edition' using errcode = '23514';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_binding.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'voting.round.status',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_binding.edition_id,
      'requestedStatus', p_status,
      'expectedGlobalVersion', p_expected_global_version,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  select *
  into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select control.version
  into v_global_version
  from televoting.studio2_round_control_state control
  where control.singleton = true
  for update;

  perform 1
  from televoting.editions edition_row
  where edition_row.id = v_round.edition_id
  for update;

  insert into televoting.studio2_round_versions (round_id)
  values (p_round_id)
  on conflict (round_id) do nothing;

  select round_version.version
  into v_round_version
  from televoting.studio2_round_versions round_version
  where round_version.round_id = p_round_id
  for update;

  if v_global_version <> p_expected_global_version
     or v_round_version <> p_expected_round_version then
    raise exception
      'Voting round state changed after preview. Refresh the impact review.'
      using errcode = '40001';
  end if;

  v_preview := televoting.studio2_round_status_payload(p_round_id, p_status);

  if jsonb_array_length(coalesce(v_preview -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception '%',
      array_to_string(
        array(select jsonb_array_elements_text(v_preview -> 'blockers')),
        ' '
      )
      using errcode = '23514';
  end if;

  if coalesce((v_preview ->> 'alreadyApplied')::boolean, false) then
    v_result := jsonb_build_object(
      'ok', true,
      'changed', false,
      'riskClass', 'R2',
      'roundId', p_round_id,
      'status', p_status,
      'operationId', v_operation_id,
      'idempotentReplay', false
    );
    return private.studio2_complete_operation(v_operation_id, v_result);
  end if;

  perform set_config('solaris.televote_round_r2', 'allowed', true);

  update televoting.rounds
  set
    status = p_status::televoting.round_status,
    opened_at = case
      when p_status = 'open' then now()
      else opened_at
    end,
    closed_at = case
      when p_status = 'closed' then now()
      when p_status = 'open' then null
      else closed_at
    end,
    results_outdated = case
      when p_status = 'open' and calculation_version > 0 then true
      else results_outdated
    end
  where id = p_round_id;

  select round_version.version
  into v_round_version
  from televoting.studio2_round_versions round_version
  where round_version.round_id = p_round_id;

  select control.version
  into v_global_version
  from televoting.studio2_round_control_state control
  where control.singleton = true;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    old_values,
    new_values,
    reason
  )
  values (
    v_actor,
    v_actor_label,
    'round_status_r2',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'status', v_round.status,
      'globalVersion', p_expected_global_version,
      'roundVersion', p_expected_round_version
    ),
    jsonb_build_object(
      'status', p_status,
      'globalVersion', v_global_version,
      'roundVersion', v_round_version,
      'operationId', v_operation_id
    ),
    'Organisation OS V5 R2 round-state command'
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'riskClass', 'R2',
    'roundId', p_round_id,
    'status', p_status,
    'globalVersion', v_global_version,
    'roundVersion', v_round_version,
    'operationId', v_operation_id,
    'idempotentReplay', false
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_round_status_change(
  uuid, text, uuid, text, bigint, bigint
) from public, anon;
grant execute on function televoting.studio2_apply_round_status_change(
  uuid, text, uuid, text, bigint, bigint
) to authenticated, service_role;

-- ============================================================
-- Jury voting window edition versions
-- ============================================================

create table if not exists public.studio2_jury_window_versions (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

insert into public.studio2_jury_window_versions (edition_id)
select distinct show_row.edition_id
from public.shows show_row
on conflict (edition_id) do nothing;

alter table public.studio2_jury_window_versions enable row level security;
revoke all on table public.studio2_jury_window_versions from public, anon, authenticated;
grant all on table public.studio2_jury_window_versions to service_role;

create or replace function private.studio2_bump_jury_window_version(
  p_edition_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $juryversion$
begin
  if p_edition_id is null then
    return;
  end if;

  insert into public.studio2_jury_window_versions as jury_version (
    edition_id,
    version,
    updated_at
  )
  values (p_edition_id, 2, now())
  on conflict (edition_id) do update set
    version = jury_version.version + 1,
    updated_at = now();
end
$juryversion$;

revoke all on function private.studio2_bump_jury_window_version(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_guard_jury_window_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $juryguard$
declare
  v_request_role text := coalesce(auth.jwt() ->> 'role', '');
  v_trusted_server boolean := v_request_role = '' or v_request_role = 'service_role';
  v_r2_allowed boolean := coalesce(
    current_setting('solaris.jury_window_r2', true),
    ''
  ) = 'allowed';
begin
  if not v_trusted_server and not v_r2_allowed then
    raise exception 'Jury voting window changes require the R2 window command.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$juryguard$;

revoke all on function private.studio2_guard_jury_window_mutation()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_jury_window_mutation
  on public.jury_voting_windows;
create trigger studio2_guard_jury_window_mutation
before insert or update or delete on public.jury_voting_windows
for each row execute function private.studio2_guard_jury_window_mutation();

create or replace function private.studio2_jury_window_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $jurywindow$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
  end if;

  if v_old_edition is not null then
    perform private.studio2_bump_jury_window_version(v_old_edition);
  end if;
  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  elsif tg_op = 'INSERT' and v_new_edition is not null then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$jurywindow$;

revoke all on function private.studio2_jury_window_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_window_version_trigger
  on public.jury_voting_windows;
create trigger studio2_jury_window_version_trigger
before insert or update or delete on public.jury_voting_windows
for each row execute function private.studio2_jury_window_version_trigger();

create or replace function private.studio2_jury_ballot_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $juryballot$
declare
  v_old_edition uuid;
  v_new_edition uuid;
  v_window_status text;
begin
  if tg_op <> 'INSERT' then v_old_edition := old.edition_id; end if;
  if tg_op <> 'DELETE' then v_new_edition := new.edition_id; end if;

  if v_old_edition is not null then
    perform private.studio2_bump_jury_window_version(v_old_edition);
  end if;
  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  elsif tg_op = 'INSERT' and v_new_edition is not null then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  end if;

  if tg_op = 'INSERT' then
    select window_row.status
    into v_window_status
    from public.jury_voting_windows window_row
    where window_row.show_id = new.show_id;

    if v_window_status is distinct from 'open' then
      raise exception 'Jury voting is no longer open for this show.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$juryballot$;

revoke all on function private.studio2_jury_ballot_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_ballot_version_trigger
  on public.jury_ballot_submissions;
create trigger studio2_jury_ballot_version_trigger
before insert or update or delete on public.jury_ballot_submissions
for each row execute function private.studio2_jury_ballot_version_trigger();

create or replace function private.studio2_jury_show_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $juryshow$
begin
  if tg_op = 'DELETE' then
    perform private.studio2_bump_jury_window_version(old.edition_id);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform private.studio2_bump_jury_window_version(new.edition_id);
    return new;
  end if;

  if old.voting_config is not distinct from new.voting_config
     and old.edition_id is not distinct from new.edition_id then
    return new;
  end if;

  perform private.studio2_bump_jury_window_version(old.edition_id);
  if new.edition_id is distinct from old.edition_id then
    perform private.studio2_bump_jury_window_version(new.edition_id);
  end if;
  return new;
end
$juryshow$;

revoke all on function private.studio2_jury_show_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_show_version_trigger
  on public.shows;
create trigger studio2_jury_show_version_trigger
before insert or update or delete on public.shows
for each row execute function private.studio2_jury_show_version_trigger();

create or replace function private.studio2_jury_participant_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $juryparticipant$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op = 'UPDATE'
     and old.show_id is not distinct from new.show_id
     and old.country_id is not distinct from new.country_id
     and old.participation_status is not distinct from new.participation_status
     and old.edition_id is not distinct from new.edition_id then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
  end if;

  if v_old_edition is not null then
    perform private.studio2_bump_jury_window_version(v_old_edition);
  end if;
  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  elsif tg_op = 'INSERT' and v_new_edition is not null then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$juryparticipant$;

revoke all on function private.studio2_jury_participant_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_participant_version_trigger
  on public.participants;
create trigger studio2_jury_participant_version_trigger
before insert or update or delete on public.participants
for each row execute function private.studio2_jury_participant_version_trigger();

create or replace function private.studio2_jury_voter_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $juryvoter$
declare
  v_old_edition uuid;
  v_new_edition uuid;
begin
  if tg_op = 'UPDATE'
     and old.show_id is not distinct from new.show_id
     and old.country_id is not distinct from new.country_id
     and old.sort_order is not distinct from new.sort_order then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    select show_row.edition_id into v_old_edition
    from public.shows show_row where show_row.id = old.show_id;
  end if;
  if tg_op <> 'DELETE' then
    select show_row.edition_id into v_new_edition
    from public.shows show_row where show_row.id = new.show_id;
  end if;

  if v_old_edition is not null then
    perform private.studio2_bump_jury_window_version(v_old_edition);
  end if;
  if v_new_edition is not null and v_new_edition is distinct from v_old_edition then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  elsif tg_op = 'INSERT' and v_new_edition is not null then
    perform private.studio2_bump_jury_window_version(v_new_edition);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$juryvoter$;

revoke all on function private.studio2_jury_voter_version_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_voter_version_trigger
  on public.voters;
create trigger studio2_jury_voter_version_trigger
before insert or update or delete on public.voters
for each row execute function private.studio2_jury_voter_version_trigger();

create or replace function private.studio2_validate_jury_window_open(
  p_show_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $juryvalidate$
declare
  v_show public.shows;
  v_participant_count integer;
  v_point_count integer;
  v_jury_enabled boolean;
  v_allow_self boolean;
  v_participating_roster_count integer;
begin
  select *
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  v_jury_enabled := coalesce((v_show.voting_config ->> 'juryEnabled')::boolean, true);
  v_allow_self := coalesce((v_show.voting_config ->> 'allowSelfVote')::boolean, false);
  v_point_count := jsonb_array_length(
    coalesce(v_show.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb)
  );

  if not v_jury_enabled then
    raise exception 'Jury voting is disabled for this show' using errcode = '23514';
  end if;

  select count(*)::integer
  into v_participant_count
  from public.participants participant
  where participant.show_id = p_show_id
    and (
      participant.participation_status is null
      or participant.participation_status = 'confirmed'
    );

  if v_participant_count < v_point_count then
    raise exception
      'This show does not have enough entries for the configured jury point scale'
      using errcode = '23514';
  end if;

  if not v_allow_self and v_participant_count = v_point_count then
    if not exists (
      select 1 from public.voters voter where voter.show_id = p_show_id
    ) then
      raise exception
        'Add one more entry or shorten the jury point scale because participating juries cannot vote for themselves'
        using errcode = '23514';
    end if;

    select count(*)::integer
    into v_participating_roster_count
    from public.voters voter
    where voter.show_id = p_show_id
      and exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and participant.country_id = voter.country_id
          and (
            participant.participation_status is null
            or participant.participation_status = 'confirmed'
          )
      );

    if v_participating_roster_count > 0 then
      raise exception
        'The configured jury scale leaves participating juries too few eligible entries after self-voting is blocked'
        using errcode = '23514';
    end if;
  end if;
end
$juryvalidate$;

revoke all on function private.studio2_validate_jury_window_open(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_jury_window_change_preview(
  p_show_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $jurypreview$
declare
  v_show public.shows;
  v_current_status text := 'closed';
  v_version bigint;
  v_submitted integer;
  v_other_windows jsonb;
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status' using errcode = '22023';
  end if;

  select *
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  insert into public.studio2_jury_window_versions (edition_id)
  values (v_show.edition_id)
  on conflict (edition_id) do nothing;

  select jury_version.version
  into v_version
  from public.studio2_jury_window_versions jury_version
  where jury_version.edition_id = v_show.edition_id;

  select coalesce(window_row.status, 'closed')
  into v_current_status
  from public.jury_voting_windows window_row
  where window_row.show_id = p_show_id;

  if not found then
    v_current_status := 'closed';
  end if;

  select count(*)::integer
  into v_submitted
  from public.jury_ballot_submissions ballot
  where ballot.show_id = p_show_id
    and ballot.status = 'submitted';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'showId', window_row.show_id,
        'showName', other_show.name
      )
      order by other_show.sort_order, other_show.name
    ),
    '[]'::jsonb
  )
  into v_other_windows
  from public.jury_voting_windows window_row
  join public.shows other_show on other_show.id = window_row.show_id
  where window_row.edition_id = v_show.edition_id
    and window_row.show_id <> p_show_id
    and window_row.status = 'open';

  if p_status = 'open' and v_current_status <> 'open' then
    perform private.studio2_validate_jury_window_open(p_show_id);
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'showId', v_show.id,
    'showName', v_show.name,
    'editionId', v_show.edition_id,
    'requestedStatus', p_status,
    'currentStatus', v_current_status,
    'expectedVersion', coalesce(v_version, 1),
    'submittedBallots', coalesce(v_submitted, 0),
    'otherOpenWindows', v_other_windows,
    'alreadyApplied', v_current_status = p_status
  );
end
$jurypreview$;

revoke all on function public.studio2_jury_window_change_preview(uuid, text)
  from public, anon;
grant execute on function public.studio2_jury_window_change_preview(uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_jury_voting_status(
  p_show_id uuid,
  p_status text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $juryapply$
declare
  v_show public.shows;
  v_current_status text := 'closed';
  v_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_actor uuid := auth.uid();
begin
  if p_status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status' using errcode = '22023';
  end if;

  select *
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
  for update;

  if v_show.id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'voting.jury.window',
    'R2',
    jsonb_build_object(
      'showId', p_show_id,
      'editionId', v_show.edition_id,
      'requestedStatus', p_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  insert into public.studio2_jury_window_versions (edition_id)
  values (v_show.edition_id)
  on conflict (edition_id) do nothing;

  select jury_version.version
  into v_version
  from public.studio2_jury_window_versions jury_version
  where jury_version.edition_id = v_show.edition_id
  for update;

  if v_version <> p_expected_version then
    raise exception
      'Jury voting state changed after preview. Refresh the impact review.'
      using errcode = '40001';
  end if;

  select coalesce(window_row.status, 'closed')
  into v_current_status
  from public.jury_voting_windows window_row
  where window_row.show_id = p_show_id;

  if not found then
    v_current_status := 'closed';
  end if;

  if v_current_status = p_status then
    v_result := jsonb_build_object(
      'ok', true,
      'changed', false,
      'riskClass', 'R2',
      'showId', p_show_id,
      'status', p_status,
      'operationId', v_operation_id,
      'idempotentReplay', false
    );
    return private.studio2_complete_operation(v_operation_id, v_result);
  end if;

  if p_status = 'open' then
    perform private.studio2_validate_jury_window_open(p_show_id);
  end if;

  perform set_config('solaris.jury_window_r2', 'allowed', true);

  if p_status = 'open' then
    update public.jury_voting_windows
    set
      status = 'closed',
      closed_at = now(),
      updated_at = now()
    where edition_id = v_show.edition_id
      and show_id <> p_show_id
      and status = 'open';
  end if;

  insert into public.jury_voting_windows (
    show_id,
    edition_id,
    status,
    opened_at,
    closed_at,
    opened_by,
    updated_at
  )
  values (
    p_show_id,
    v_show.edition_id,
    p_status,
    case when p_status = 'open' then now() else null end,
    case when p_status = 'closed' then now() else null end,
    case when p_status = 'open' then v_actor else null end,
    now()
  )
  on conflict (show_id) do update set
    edition_id = excluded.edition_id,
    status = excluded.status,
    opened_at = case
      when excluded.status = 'open' then now()
      else public.jury_voting_windows.opened_at
    end,
    closed_at = case
      when excluded.status = 'closed' then now()
      else null
    end,
    opened_by = case
      when excluded.status = 'open' then v_actor
      else public.jury_voting_windows.opened_by
    end,
    updated_at = now();

  select jury_version.version
  into v_version
  from public.studio2_jury_window_versions jury_version
  where jury_version.edition_id = v_show.edition_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'jury_window_r2_' || p_status,
    'jury_voting_windows',
    p_show_id::text,
    jsonb_build_object(
      'status', v_current_status,
      'version', p_expected_version
    ),
    jsonb_build_object(
      'status', p_status,
      'version', v_version,
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'changed', true,
    'riskClass', 'R2',
    'showId', p_show_id,
    'status', p_status,
    'version', v_version,
    'operationId', v_operation_id,
    'idempotentReplay', false
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$juryapply$;

revoke all on function public.studio2_apply_jury_voting_status(
  uuid, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_jury_voting_status(
  uuid, text, uuid, text, bigint
) to authenticated, service_role;

-- Retire the authenticated legacy status mutation boundary. Trusted
-- service-role automation may still use it for repair/migration work, while
-- Organizer UI must use the R2 preview/apply contract above.
revoke execute on function public.admin_set_jury_voting_status(uuid, text)
  from authenticated;
grant execute on function public.admin_set_jury_voting_status(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
