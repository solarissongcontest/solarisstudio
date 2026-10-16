begin;

-- System V3 / S14: real server-authoritative Televote deadline extension.
--
-- `status = open` remains the lifecycle authority. A round opts into the V3
-- deadline authority when voting_deadline_revision becomes >= 1. Revision 0 is
-- an explicit migration-compatibility state for historical/legacy rounds that
-- predate this contract; it is not used by the S14 V3 path. Once a round is on
-- the deadline authority, public ballot acceptance is governed by database
-- server time and cannot fall back to client clocks or close/reopen semantics.

alter table televoting.rounds
  add column if not exists voting_deadline_at timestamptz;

alter table televoting.rounds
  add column if not exists voting_deadline_revision bigint not null default 0;

do $constraint$
begin
  alter table televoting.rounds
    add constraint televoting_rounds_deadline_revision_v3_check
    check (
      voting_deadline_revision >= 0
      and (
        (voting_deadline_revision = 0 and voting_deadline_at is null)
        or (voting_deadline_revision >= 1 and voting_deadline_at is not null)
      )
    ) not valid;
exception
  when duplicate_object then null;
end
$constraint$;

comment on column televoting.rounds.voting_deadline_at is
  'Server-authoritative ballot acceptance deadline for rounds migrated to the V3 deadline authority.';
comment on column televoting.rounds.voting_deadline_revision is
  '0 = legacy compatibility without a canonical deadline; >=1 = V3 deadline authority revision. Extensions increment this revision.';

create index if not exists televoting_rounds_deadline_v3_idx
  on televoting.rounds (voting_deadline_at)
  where voting_deadline_revision >= 1 and status = 'open';

create or replace function private.v3_guard_direct_televote_deadline()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if (
    new.voting_deadline_at is distinct from old.voting_deadline_at
    or new.voting_deadline_revision is distinct from old.voting_deadline_revision
  ) and current_user in ('authenticated', 'anon') then
    raise exception
      'Televote deadline changes must use the governed Organisation OS operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_direct_televote_deadline()
  from public, anon, authenticated;

drop trigger if exists v3_guard_direct_televote_deadline
  on televoting.rounds;
create trigger v3_guard_direct_televote_deadline
before update of voting_deadline_at, voting_deadline_revision on televoting.rounds
for each row execute function private.v3_guard_direct_televote_deadline();

-- Initial deadline configuration is a separate governed operation. It can be
-- used while a legacy round is draft or already open, which makes this an
-- additive migration rather than a flag-day outage for a pre-existing round.
create or replace function televoting.studio2_round_deadline_set_preview(
  p_round_id uuid,
  p_deadline_at timestamptz
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
  v_now timestamptz := clock_timestamp();
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_round_id is null or p_deadline_at is null then
    raise exception 'Round id and deadline are required' using errcode = '22023';
  end if;

  select * into v_round
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

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
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

  if v_round.voting_deadline_revision <> 0
     or v_round.voting_deadline_at is not null then
    v_blockers := v_blockers || jsonb_build_array(
      'This round already has canonical deadline authority. Extend the existing deadline instead.'
    );
  end if;

  if v_round.status::text not in ('draft', 'open') then
    v_blockers := v_blockers || jsonb_build_array(
      'A canonical deadline can only be configured for a draft or open round.'
    );
  end if;

  if p_deadline_at <= v_now then
    v_blockers := v_blockers || jsonb_build_array(
      'Voting deadline must be in the future according to server time.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'operation', 'televote.round.deadline_set',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_solaris_edition_id,
    'status', v_round.status,
    'currentDeadline', v_round.voting_deadline_at,
    'currentDeadlineRevision', v_round.voting_deadline_revision,
    'requestedDeadline', p_deadline_at,
    'expectedGlobalVersion', v_global_version,
    'expectedRoundVersion', v_round_version,
    'serverTime', v_now,
    'blockers', v_blockers,
    'alreadyApplied', v_round.voting_deadline_revision >= 1
      and v_round.voting_deadline_at is not distinct from p_deadline_at
  );
end
$preview$;

revoke all on function televoting.studio2_round_deadline_set_preview(uuid, timestamptz)
  from public, anon;
grant execute on function televoting.studio2_round_deadline_set_preview(uuid, timestamptz)
  to authenticated, service_role;

create or replace function televoting.studio2_apply_round_deadline_set(
  p_round_id uuid,
  p_deadline_at timestamptz,
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
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  if p_round_id is null
     or p_deadline_at is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_global_version is null
     or p_expected_round_version is null
     or p_expected_global_version < 0
     or p_expected_round_version < 0 then
    raise exception 'Deadline, operation id, idempotency key and expected versions are required'
      using errcode = '22023';
  end if;

  select * into v_round
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

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'televote.round.deadline_set',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_solaris_edition_id,
      'deadlineAt', p_deadline_at,
      'expectedGlobalVersion', p_expected_global_version,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('studio2-televote-round-state', 0));

  select * into v_round
  from televoting.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

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

  if v_round.voting_deadline_revision <> 0
     or v_round.voting_deadline_at is not null then
    raise exception 'Canonical voting deadline is already configured. Use the extension operation.'
      using errcode = '23514';
  end if;

  if v_round.status::text not in ('draft', 'open') then
    raise exception 'Canonical voting deadline can only be configured for a draft or open round.'
      using errcode = '23514';
  end if;

  v_now := clock_timestamp();
  if p_deadline_at <= v_now then
    raise exception 'Voting deadline must be in the future according to server time.'
      using errcode = '22023';
  end if;

  update televoting.rounds
  set voting_deadline_at = p_deadline_at,
      voting_deadline_revision = 1,
      updated_at = v_now
  where id = p_round_id;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    old_values,
    new_values
  ) values (
    auth.uid(),
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      auth.uid()::text
    ),
    'round_deadline_set',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'voting_deadline_at', null,
      'voting_deadline_revision', 0
    ),
    jsonb_build_object(
      'voting_deadline_at', p_deadline_at,
      'voting_deadline_revision', 1
    )
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
    'status', v_round.status,
    'deadline', p_deadline_at,
    'deadlineRevision', 1,
    'serverTime', v_now,
    'operationId', v_operation_id,
    'previousGlobalVersion', v_current_global,
    'globalVersion', v_next_global,
    'previousRoundVersion', v_current_round,
    'roundVersion', v_next_round
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_round_deadline_set(
  uuid, timestamptz, uuid, text, bigint, bigint
) from public, anon;
grant execute on function televoting.studio2_apply_round_deadline_set(
  uuid, timestamptz, uuid, text, bigint, bigint
) to authenticated, service_role;

-- The extension contract is deliberately additive. It never changes `status`,
-- `opened_at` or `closed_at`, so a deadline extension cannot masquerade as a
-- close/reopen cycle.
create or replace function televoting.studio2_round_deadline_extension_preview(
  p_round_id uuid,
  p_extend_seconds integer
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
  v_now timestamptz := clock_timestamp();
  v_new_deadline timestamptz;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_round_id is null or p_extend_seconds is null or p_extend_seconds <= 0 then
    raise exception 'Round id and a positive extension are required'
      using errcode = '22023';
  end if;

  select * into v_round
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

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
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

  if v_round.status::text <> 'open' then
    v_blockers := v_blockers || jsonb_build_array(
      'Only an open Televote round can have its active voting deadline extended.'
    );
  end if;

  if v_round.voting_deadline_revision < 1
     or v_round.voting_deadline_at is null then
    v_blockers := v_blockers || jsonb_build_array(
      'This round has not entered the canonical V3 deadline authority.'
    );
  else
    v_new_deadline := v_round.voting_deadline_at + make_interval(secs => p_extend_seconds);
    if v_new_deadline <= v_now then
      v_blockers := v_blockers || jsonb_build_array(
        'The requested extension would still leave voting closed according to server time.'
      );
    end if;
  end if;

  if v_round.results_status in ('locked', 'published') then
    v_blockers := v_blockers || jsonb_build_array(
      'Locked or published Televote results cannot receive a voting deadline extension.'
    );
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'operation', 'televote.round.extend_deadline',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_solaris_edition_id,
    'status', v_round.status,
    'previousDeadline', v_round.voting_deadline_at,
    'previousDeadlineRevision', v_round.voting_deadline_revision,
    'extendSeconds', p_extend_seconds,
    'newDeadline', v_new_deadline,
    'expectedGlobalVersion', v_global_version,
    'expectedRoundVersion', v_round_version,
    'serverTime', v_now,
    'blockers', v_blockers,
    'alreadyApplied', false
  );
end
$preview$;

revoke all on function televoting.studio2_round_deadline_extension_preview(uuid, integer)
  from public, anon;
grant execute on function televoting.studio2_round_deadline_extension_preview(uuid, integer)
  to authenticated, service_role;

create or replace function televoting.studio2_apply_round_deadline_extension(
  p_round_id uuid,
  p_extend_seconds integer,
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
  v_now timestamptz := clock_timestamp();
  v_previous_deadline timestamptz;
  v_new_deadline timestamptz;
  v_previous_deadline_revision bigint;
  v_new_deadline_revision bigint;
  v_result jsonb;
begin
  if p_round_id is null
     or p_extend_seconds is null
     or p_extend_seconds <= 0
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_global_version is null
     or p_expected_round_version is null
     or p_expected_global_version < 0
     or p_expected_round_version < 0 then
    raise exception 'Positive extension, operation id, idempotency key and expected versions are required'
      using errcode = '22023';
  end if;

  select * into v_round
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

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'televote.round.extend_deadline',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_solaris_edition_id,
      'extendSeconds', p_extend_seconds,
      'expectedGlobalVersion', p_expected_global_version,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('studio2-televote-round-state', 0));

  select * into v_round
  from televoting.rounds
  where id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

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

  if v_round.status::text <> 'open' then
    raise exception 'Only an open Televote round can have its active voting deadline extended.'
      using errcode = '23514';
  end if;

  if v_round.voting_deadline_revision < 1
     or v_round.voting_deadline_at is null then
    raise exception 'This round has not entered the canonical V3 deadline authority.'
      using errcode = '23514';
  end if;

  if v_round.results_status in ('locked', 'published') then
    raise exception 'Locked or published Televote results cannot receive a voting deadline extension.'
      using errcode = '23514';
  end if;

  v_now := clock_timestamp();
  v_previous_deadline := v_round.voting_deadline_at;
  v_previous_deadline_revision := v_round.voting_deadline_revision;
  v_new_deadline := v_previous_deadline + make_interval(secs => p_extend_seconds);
  v_new_deadline_revision := v_previous_deadline_revision + 1;

  if v_new_deadline <= v_now then
    raise exception 'Requested extension would still leave voting closed according to server time.'
      using errcode = '22023';
  end if;

  update televoting.rounds
  set voting_deadline_at = v_new_deadline,
      voting_deadline_revision = v_new_deadline_revision,
      updated_at = v_now
  where id = p_round_id;

  insert into televoting.admin_audit_log (
    actor_admin_id,
    actor_username,
    action,
    target_type,
    target_id,
    old_values,
    new_values
  ) values (
    auth.uid(),
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      auth.uid()::text
    ),
    'round_deadline_extended',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'voting_deadline_at', v_previous_deadline,
      'voting_deadline_revision', v_previous_deadline_revision
    ),
    jsonb_build_object(
      'voting_deadline_at', v_new_deadline,
      'voting_deadline_revision', v_new_deadline_revision,
      'extended_by_seconds', p_extend_seconds
    )
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
    'status', v_round.status,
    'operationId', v_operation_id,
    'extendedBySeconds', p_extend_seconds,
    'previousDeadline', v_previous_deadline,
    'newDeadline', v_new_deadline,
    'previousDeadlineRevision', v_previous_deadline_revision,
    'deadlineRevision', v_new_deadline_revision,
    'serverTime', v_now,
    'previousGlobalVersion', v_current_global,
    'globalVersion', v_next_global,
    'previousRoundVersion', v_current_round,
    'roundVersion', v_next_round
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_round_deadline_extension(
  uuid, integer, uuid, text, bigint, bigint
) from public, anon;
grant execute on function televoting.studio2_apply_round_deadline_extension(
  uuid, integer, uuid, text, bigint, bigint
) to authenticated, service_role;

-- Extend the existing public ballot authority rather than adding a second write
-- path. Revision 0 preserves only pre-V3 compatibility; canonical V3 rounds are
-- rejected after the persisted deadline according to database server time.
create or replace function televoting.submit_vote_checked(
  p_round_id uuid,
  p_username text,
  p_country_code text,
  p_entries jsonb,
  p_preflight_token uuid,
  p_ip_hash text default null,
  p_fingerprint_hash text default null,
  p_device_token_hash text default null,
  p_ip_country text default null,
  p_is_vpn boolean default false
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_round televoting.rounds%rowtype;
  v_preflight televoting.vote_preflight_checks%rowtype;
  v_username_norm text;
  v_total int := 0;
  v_entry jsonb;
  v_tc text;
  v_pts int;
  v_round_keys text[];
  v_seen text[] := array[]::text[];
  v_sub_id uuid;
  v_count int;
  v_home_exists boolean;
  v_self_key text;
  v_ballot_map jsonb := '{}'::jsonb;
begin
  if p_username is null or length(trim(p_username))<2 then
    raise exception 'Username required' using errcode='22023';
  end if;
  if p_preflight_token is null then
    raise exception 'Review this ballot with the automatic voting integrity check before submitting' using errcode='22023';
  end if;

  v_username_norm := lower(trim(p_username));
  select * into v_round from televoting.rounds where id=p_round_id;
  if not found then raise exception 'Round not found' using errcode='22023'; end if;
  if v_round.status<>'open' then raise exception 'Round is not open' using errcode='22023'; end if;
  if v_round.voting_deadline_revision >= 1 then
    if v_round.voting_deadline_at is null then
      raise exception 'Canonical voting deadline is invalid' using errcode='23514';
    end if;
    if clock_timestamp() > v_round.voting_deadline_at then
      raise exception 'Voting deadline has passed' using errcode='22023';
    end if;
  end if;

  select array_agg(entry_key) into v_round_keys
  from televoting.round_entries where round_id=p_round_id;
  if v_round_keys is null or array_length(v_round_keys,1)<2 then
    raise exception 'Round has no entries configured' using errcode='22023';
  end if;

  select exists(select 1 from televoting.countries where code=p_country_code) into v_home_exists;
  if not v_home_exists then raise exception 'Unknown home country' using errcode='22023'; end if;
  if p_entries is null or jsonb_typeof(p_entries)<>'array' then
    raise exception 'Invalid entries payload' using errcode='22023';
  end if;

  if coalesce(v_round.self_voting_mode,'country_match') in ('country_match','linked_identity','disabled') then
    select entry_key into v_self_key
    from televoting.round_entries
    where round_id=p_round_id and entry_type='country' and country_code=p_country_code;
  end if;
  if coalesce(v_round.self_voting_mode,'country_match')='unrestricted' then v_self_key:=null; end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_tc:=v_entry->>'target_country_code';
    v_pts:=(v_entry->>'points')::int;
    if v_pts is null or v_pts<1 or v_pts>10 then
      raise exception 'Points must be 1-10' using errcode='22023';
    end if;
    if v_self_key is not null and v_tc=v_self_key then
      insert into televoting.anti_abuse_events(
        round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
        device_token_hash,reason,risk_score,metadata
      ) values(
        p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
        p_device_token_hash,'self_vote',80,
        jsonb_build_object('ip_country',p_ip_country,'is_vpn',p_is_vpn)
      );
      raise exception 'Cannot vote for your own entry' using errcode='22023';
    end if;
    if not (v_tc=any(v_round_keys)) then
      raise exception 'Entry is not part of this round' using errcode='22023';
    end if;
    if v_tc=any(v_seen) then
      raise exception 'Duplicate entry in ballot' using errcode='22023';
    end if;
    v_seen:=v_seen||v_tc;
    v_total:=v_total+v_pts;
    v_ballot_map:=v_ballot_map || jsonb_build_object(v_tc,v_pts);
  end loop;

  v_count:=coalesce(array_length(v_seen,1),0);
  if v_total<>20 then
    insert into televoting.anti_abuse_events(
      round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
      device_token_hash,reason,risk_score,metadata
    ) values(
      p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
      p_device_token_hash,'wrong_total_points',60,jsonb_build_object('total',v_total)
    );
    raise exception 'Total must be exactly 20 points (got %)',v_total using errcode='22023';
  end if;
  if v_count<5 then
    insert into televoting.anti_abuse_events(
      round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
      device_token_hash,reason,risk_score,metadata
    ) values(
      p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
      p_device_token_hash,'too_few_countries',50,jsonb_build_object('count',v_count)
    );
    raise exception 'Vote at least 5 different entries' using errcode='22023';
  end if;

  select * into v_preflight
  from televoting.vote_preflight_checks
  where id=p_preflight_token
  for update;

  if not found then
    raise exception 'Voting integrity check not found. Review the ballot again.' using errcode='22023';
  end if;
  if v_preflight.expires_at<=now() then
    raise exception 'Voting integrity check expired. Review the ballot again.' using errcode='22023';
  end if;
  if v_preflight.submitted_at is not null then
    raise exception 'This voting integrity check has already been used' using errcode='23505';
  end if;
  if v_preflight.round_id<>p_round_id
     or v_preflight.username_normalized<>v_username_norm
     or upper(v_preflight.country_code)<>upper(p_country_code) then
    raise exception 'Ballot identity changed after the integrity check. Review it again.' using errcode='22023';
  end if;
  if v_preflight.ballot_map<>v_ballot_map then
    raise exception 'Ballot changed after the integrity check. Review the updated ballot again.' using errcode='22023';
  end if;
  if coalesce(v_preflight.ip_hash,'')<>coalesce(p_ip_hash,'')
     or coalesce(v_preflight.fingerprint_hash,'')<>coalesce(p_fingerprint_hash,'')
     or coalesce(v_preflight.device_token_hash,'')<>coalesce(p_device_token_hash,'') then
    raise exception 'Connection or device identity changed after the integrity check. Review the ballot again.' using errcode='22023';
  end if;
  if v_preflight.requires_attestation and v_preflight.attested_at is null then
    raise exception 'This ballot requires the voting-integrity declaration before it can be submitted' using errcode='22023';
  end if;

  if exists(select 1 from televoting.vote_submissions where round_id=p_round_id and username_normalized=v_username_norm and status<>'deleted') then
    raise exception 'You have already voted in this round' using errcode='23505';
  end if;
  if p_ip_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and ip_hash=p_ip_hash and status<>'deleted') then
    raise exception 'A vote from this network was already recorded' using errcode='23505';
  end if;
  if p_fingerprint_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and fingerprint_hash=p_fingerprint_hash and status<>'deleted') then
    raise exception 'A vote from this device was already recorded' using errcode='23505';
  end if;
  if p_device_token_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and device_token_hash=p_device_token_hash and status<>'deleted') then
    raise exception 'A vote from this device was already recorded' using errcode='23505';
  end if;

  insert into televoting.vote_submissions(
    round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
    device_token_hash,ip_country,is_vpn,risk_score,status
  ) values(
    p_round_id,trim(p_username),v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
    p_device_token_hash,p_ip_country,coalesce(p_is_vpn,false),v_preflight.risk_score,
    case when v_preflight.requires_attestation then 'suspicious' else 'active' end
  ) returning id into v_sub_id;

  insert into televoting.vote_entries(submission_id,target_country_code,points)
  select v_sub_id,e->>'target_country_code',(e->>'points')::int
  from jsonb_array_elements(p_entries)e;

  if v_preflight.requires_attestation or v_preflight.risk_score>0 then
    insert into televoting.anti_abuse_events(
      round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
      device_token_hash,reason,risk_score,metadata,status
    ) values(
      p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
      p_device_token_hash,'pre_submit_integrity_check',v_preflight.risk_score,
      jsonb_build_object(
        'preflight_id',v_preflight.id,
        'severity',v_preflight.severity,
        'relationship_risk',v_preflight.relationship_risk,
        'findings',v_preflight.findings,
        'technical_signals',v_preflight.technical_signals,
        'attested',v_preflight.attested_at is not null,
        'ip_country',p_ip_country,
        'is_vpn',p_is_vpn
      ),
      case when v_preflight.requires_attestation then 'pending' else 'context' end
    );
  end if;

  update televoting.vote_preflight_checks
  set submission_id=v_sub_id, submitted_at=now()
  where id=v_preflight.id;

  return jsonb_build_object(
    'id',v_sub_id,
    'risk_score',v_preflight.risk_score,
    'status',case when v_preflight.requires_attestation then 'suspicious' else 'active' end,
    'preflight_id',v_preflight.id
  );
end $$;

revoke all on function televoting.submit_vote_checked(uuid,text,text,jsonb,uuid,text,text,text,text,boolean) from public;
grant execute on function televoting.submit_vote_checked(uuid,text,text,jsonb,uuid,text,text,text,text,boolean) to anon, authenticated;

-- Successful extension receipts emit one canonical fact. The existing S5
-- operation-event trigger ignores this command; this focused trigger handles it
-- without replacing the open/close/ballot event bridge.
create or replace function private.v3_emit_televote_deadline_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $emit$
declare
  v_round_id uuid;
  v_edition_id uuid;
  v_round_version bigint;
  v_previous_deadline timestamptz;
  v_new_deadline timestamptz;
  v_previous_deadline_revision bigint;
  v_deadline_revision bigint;
  v_extended_seconds integer;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'televote.round.extend_deadline' then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_edition_id := nullif(new.scope ->> 'solarisEditionId', '')::uuid;
    v_round_version := nullif(new.result ->> 'roundVersion', '')::bigint;
    v_previous_deadline := nullif(new.result ->> 'previousDeadline', '')::timestamptz;
    v_new_deadline := nullif(new.result ->> 'newDeadline', '')::timestamptz;
    v_previous_deadline_revision := nullif(new.result ->> 'previousDeadlineRevision', '')::bigint;
    v_deadline_revision := nullif(new.result ->> 'deadlineRevision', '')::bigint;
    v_extended_seconds := nullif(new.result ->> 'extendedBySeconds', '')::integer;
  exception when invalid_text_representation then
    raise exception 'Completed Televote deadline extension has invalid event provenance'
      using errcode = '23514';
  end;

  if v_round_id is null
     or v_edition_id is null
     or v_round_version is null
     or v_previous_deadline is null
     or v_new_deadline is null
     or v_previous_deadline_revision is null
     or v_deadline_revision is null
     or v_extended_seconds is null then
    raise exception 'Completed Televote deadline extension lacks event provenance'
      using errcode = '23514';
  end if;

  if v_new_deadline <= v_previous_deadline
     or v_deadline_revision <> v_previous_deadline_revision + 1
     or v_extended_seconds <= 0 then
    raise exception 'Completed Televote deadline extension provenance is inconsistent'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from televoting.rounds round_row
    join public.integration_links link
      on link.service = 'televoting'
     and link.entity_type = 'edition'
     and link.remote_id = round_row.edition_id::text
     and link.solaris_id = v_edition_id
    where round_row.id = v_round_id
      and round_row.voting_deadline_revision >= v_deadline_revision
  ) then
    raise exception 'Completed Televote deadline extension is outside canonical edition/round scope'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'televote.extended',
    'televote_round',
    v_round_id::text,
    v_round_version,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_build_object(
      'roundId', v_round_id,
      'previousDeadline', v_previous_deadline,
      'newDeadline', v_new_deadline,
      'extendedBySeconds', v_extended_seconds,
      'previousDeadlineRevision', v_previous_deadline_revision,
      'deadlineRevision', v_deadline_revision,
      'previousRoundVersion', new.result -> 'previousRoundVersion',
      'roundVersion', new.result -> 'roundVersion'
    ),
    1,
    array['televote.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_televote_deadline_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_televote_deadline_event
  on public.studio2_operation_receipts;
create trigger v3_emit_televote_deadline_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_televote_deadline_event();

-- Reuse the existing replay-safe Televote task consumer for extension-driven
-- task/readiness reconciliation. Notifications remain specific to opening; a
-- deadline extension does not invent a new push policy here.
create or replace function public.studio2_process_televote_domain_event(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $process$
declare
  v_event private.v3_domain_events%rowtype;
  v_delivery private.v3_domain_event_outbox%rowtype;
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
  v_delivery_candidates integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key not in ('televote.tasks', 'televote.notifications')
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Televote domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in (
       'televote.opened',
       'televote.extended',
       'televote.closed',
       'televote.ballot_submitted'
     ) then
    raise exception 'Televote consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  if p_consumer_key = 'televote.notifications'
     and v_event.event_type <> 'televote.opened' then
    raise exception 'Televote notification consumer only accepts televote.opened'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Televote domain event delivery was not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from private.v3_domain_event_consumer_receipts receipt
    where receipt.event_id = p_event_id
      and receipt.consumer_key = p_consumer_key
  ) then
    return public.studio2_complete_domain_event_delivery(
      p_event_id,
      p_consumer_key,
      p_worker_id,
      '{}'::jsonb
    );
  end if;

  if v_delivery.status <> 'processing'
     or v_delivery.lease_owner is distinct from p_worker_id
     or v_delivery.lease_expires_at <= now() then
    raise exception 'Televote domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  if p_consumer_key = 'televote.tasks' then
    perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
    v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
    v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
    v_metadata := jsonb_build_object(
      'effect', 'televote-task-reconciliation',
      'eventType', v_event.event_type,
      'editionId', v_event.edition_id,
      'taskNotificationsChanged', v_task_notifications,
      'staleTaskNotificationsPruned', v_pruned_notifications
    );
  else
    v_delivery_candidates := public.solaris_enqueue_app_notifications(now());
    v_metadata := jsonb_build_object(
      'effect', 'televote-open-notification-evaluation',
      'editionId', v_event.edition_id,
      'deliveryCandidatesInserted', v_delivery_candidates
    );
  end if;

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_televote_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_televote_domain_event(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
