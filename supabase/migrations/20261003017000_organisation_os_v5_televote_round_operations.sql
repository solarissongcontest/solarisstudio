begin;

-- Organisation OS V5: Televote round lifecycle is an R2 operation.
--
-- The Televoting schema enforces one open round globally, so lifecycle
-- concurrency is system-wide. A second per-round revision protects line-up and
-- round-configuration truth used by the impact preview.

create table if not exists public.studio2_televote_global_versions (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_televote_global_versions (singleton, version)
values (true, 0)
on conflict (singleton) do nothing;

create table if not exists public.studio2_televote_round_versions (
  round_id uuid primary key,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.studio2_televote_global_versions enable row level security;
alter table public.studio2_televote_round_versions enable row level security;
revoke all on table public.studio2_televote_global_versions from public, anon, authenticated;
revoke all on table public.studio2_televote_round_versions from public, anon, authenticated;
grant all on table public.studio2_televote_global_versions to service_role;
grant all on table public.studio2_televote_round_versions to service_role;

create or replace function private.studio2_touch_televote_global_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
begin
  insert into public.studio2_televote_global_versions (singleton, version, updated_at)
  values (true, 1, now())
  on conflict (singleton) do update
  set version = public.studio2_televote_global_versions.version + 1,
      updated_at = excluded.updated_at;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_televote_global_version()
  from public, anon, authenticated;

drop trigger if exists studio2_televote_rounds_touch_global_version
  on televoting.rounds;
create trigger studio2_televote_rounds_touch_global_version
after insert or delete or update of status on televoting.rounds
for each row execute function private.studio2_touch_televote_global_version();

create or replace function private.studio2_touch_televote_round_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $touch$
declare
  v_new_round uuid;
  v_old_round uuid;
begin
  if tg_table_name = 'rounds' then
    if tg_op = 'DELETE' then
      delete from public.studio2_televote_round_versions
      where round_id = old.id;
      return old;
    end if;
    v_new_round := new.id;
    if tg_op = 'UPDATE' then
      v_old_round := old.id;
    end if;
  elsif tg_table_name = 'round_entries' then
    if tg_op <> 'DELETE' then
      v_new_round := new.round_id;
    end if;
    if tg_op <> 'INSERT' then
      v_old_round := old.round_id;
    end if;
  end if;

  if v_new_round is not null
     and exists (select 1 from televoting.rounds r where r.id = v_new_round) then
    insert into public.studio2_televote_round_versions (round_id, version, updated_at)
    values (v_new_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_televote_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_round is not null
     and v_old_round is distinct from v_new_round
     and exists (select 1 from televoting.rounds r where r.id = v_old_round) then
    insert into public.studio2_televote_round_versions (round_id, version, updated_at)
    values (v_old_round, 1, now())
    on conflict (round_id) do update
    set version = public.studio2_televote_round_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_televote_round_version()
  from public, anon, authenticated;

drop trigger if exists studio2_televote_rounds_touch_round_version
  on televoting.rounds;
create trigger studio2_televote_rounds_touch_round_version
after insert or update on televoting.rounds
for each row execute function private.studio2_touch_televote_round_version();

drop trigger if exists studio2_televote_entries_touch_round_version
  on televoting.round_entries;
create trigger studio2_televote_entries_touch_round_version
after insert or update or delete on televoting.round_entries
for each row execute function private.studio2_touch_televote_round_version();

create or replace function private.studio2_guard_direct_televote_status()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if new.status is distinct from old.status
     and current_user in ('authenticated', 'anon') then
    raise exception
      'Televote round status must use the Organisation OS operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.studio2_guard_direct_televote_status()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_direct_televote_status
  on televoting.rounds;
create trigger studio2_guard_direct_televote_status
before update of status on televoting.rounds
for each row execute function private.studio2_guard_direct_televote_status();

create or replace function televoting.studio2_round_status_change_preview(
  p_round_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $preview$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_global_version bigint := 0;
  v_round_version bigint := 0;
  v_entry_count integer := 0;
  v_ballot_count integer := 0;
  v_suspicious_count integer := 0;
  v_other_open jsonb := null;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid televote round status' using errcode = '22023';
  end if;

  select *
  into v_round
  from televoting.rounds
  where id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select link.solaris_id
  into v_solaris_edition_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.remote_id = v_round.edition_id::text
  limit 1;

  if v_solaris_edition_id is null then
    raise exception 'Voting round is not linked to a Solaris edition'
      using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed(
    'voting.manage',
    v_solaris_edition_id,
    false
  ) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  select coalesce(version, 0)
  into v_global_version
  from public.studio2_televote_global_versions
  where singleton = true;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), 0)
  into v_round_version;

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

  select jsonb_build_object(
    'roundId', other_round.id,
    'roundName', other_round.name,
    'editionId', other_round.edition_id
  )
  into v_other_open
  from televoting.rounds other_round
  where other_round.status = 'open'
    and other_round.id <> p_round_id
  limit 1;

  if p_status = 'open' and (v_entry_count < 2 or v_entry_count > 50) then
    v_blockers := v_blockers || jsonb_build_array(
      'Voting requires between 2 and 50 entries.'
    );
  end if;

  if p_status = 'open' and v_other_open is not null then
    v_blockers := v_blockers || jsonb_build_array(
      'Another televote round is already open.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_solaris_edition_id,
    'requestedStatus', p_status,
    'currentStatus', v_round.status,
    'expectedGlobalVersion', v_global_version,
    'expectedRoundVersion', v_round_version,
    'entryCount', v_entry_count,
    'ballotCount', v_ballot_count,
    'suspiciousBallotCount', v_suspicious_count,
    'resultsStatus', v_round.results_status,
    'calculationVersion', v_round.calculation_version,
    'resultsOutdated', v_round.results_outdated,
    'otherOpenRound', v_other_open,
    'blockers', v_blockers,
    'alreadyApplied', v_round.status::text = p_status
  );
end
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
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_global bigint := 0;
  v_current_round bigint := 0;
  v_next_global bigint := 0;
  v_next_round bigint := 0;
  v_entry_count integer := 0;
  v_other_open uuid;
  v_now timestamptz := now();
  v_result jsonb;
begin
  if p_status not in ('draft', 'open', 'closed') then
    raise exception 'Invalid televote round status' using errcode = '22023';
  end if;
  if p_operation_id is null
     or p_expected_global_version is null
     or p_expected_round_version is null
     or p_expected_global_version < 0
     or p_expected_round_version < 0 then
    raise exception 'Operation id and expected televote versions are required'
      using errcode = '22023';
  end if;

  select *
  into v_round
  from televoting.rounds
  where id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select link.solaris_id
  into v_solaris_edition_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.remote_id = v_round.edition_id::text
  limit 1;

  if v_solaris_edition_id is null then
    raise exception 'Voting round is not linked to a Solaris edition'
      using errcode = 'P0002';
  end if;

  if not public.studio2_access_allowed(
    'voting.manage',
    v_solaris_edition_id,
    false
  ) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'televote.round.' || p_status,
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_solaris_edition_id,
      'requestedStatus', p_status,
      'expectedGlobalVersion', p_expected_global_version,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-televote-round-state', 0)
  );

  select coalesce(version, 0)
  into v_current_global
  from public.studio2_televote_global_versions
  where singleton = true;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), 0)
  into v_current_round;

  if p_expected_global_version <> v_current_global
     or p_expected_round_version <> v_current_round then
    raise exception 'Televote round state changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  if p_status = 'open' then
    select count(*)::integer
    into v_entry_count
    from televoting.round_entries entry
    where entry.round_id = p_round_id;

    if v_entry_count < 2 or v_entry_count > 50 then
      raise exception 'Round must have between 2 and 50 entries (has %)', v_entry_count
        using errcode = '23514';
    end if;

    select other_round.id
    into v_other_open
    from televoting.rounds other_round
    where other_round.status = 'open'
      and other_round.id <> p_round_id
    limit 1;

    if v_other_open is not null then
      raise exception 'Another round is already open. Close it first.'
        using errcode = '23505';
    end if;
  end if;

  update televoting.rounds
  set status = p_status::televoting.round_status,
      opened_at = case when p_status = 'open' then v_now else opened_at end,
      closed_at = case when p_status = 'closed' then v_now else closed_at end,
      updated_at = v_now
  where id = p_round_id;

  if p_status = 'open' then
    update public.televoting_round_bindings
    set frozen_at = v_now,
        updated_at = v_now
    where remote_round_id = p_round_id;
  elsif p_status = 'draft' then
    update public.televoting_round_bindings
    set frozen_at = null,
        updated_at = v_now
    where remote_round_id = p_round_id;
  end if;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    old_values,
    new_values
  )
  values (
    auth.uid(),
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      auth.uid()::text
    ),
    'round_' || p_status,
    'round',
    p_round_id::text,
    jsonb_build_object('status', v_round.status),
    jsonb_build_object('status', p_status)
  );

  select coalesce(version, v_current_global)
  into v_next_global
  from public.studio2_televote_global_versions
  where singleton = true;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), v_current_round)
  into v_next_round;

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'roundId', p_round_id,
    'status', p_status,
    'operationId', v_operation_id,
    'previousGlobalVersion', v_current_global,
    'globalVersion', v_next_global,
    'previousRoundVersion', v_current_round,
    'roundVersion', v_next_round
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

notify pgrst, 'reload schema';

commit;
