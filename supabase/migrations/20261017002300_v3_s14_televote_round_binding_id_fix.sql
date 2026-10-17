begin;

-- System V3 / S14 follow-up.
-- public.televoting_round_bindings.remote_round_id is intentionally text because
-- it stores remote integration identifiers. The canonical lifecycle RPC accepts
-- a UUID round id, so open/draft binding freeze updates must compare against the
-- UUID's text representation. Without the cast PostgreSQL raises operator does
-- not exist: text = uuid after the round status itself has already been changed.

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

  if p_status in ('open', 'draft')
     and v_round.results_status in ('locked', 'published') then
    raise exception 'Locked or published televote results must be unlocked before voting workflow can reopen.'
      using errcode = '23514';
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
      results_outdated = case
        when p_status = 'open' and calculation_version > 0 then true
        else results_outdated
      end,
      updated_at = v_now
  where id = p_round_id;

  if p_status = 'open' then
    update public.televoting_round_bindings
    set frozen_at = v_now,
        updated_at = v_now
    where remote_round_id = p_round_id::text;
  elsif p_status = 'draft' then
    update public.televoting_round_bindings
    set frozen_at = null,
        updated_at = v_now
    where remote_round_id = p_round_id::text;
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

commit;
