begin;

-- System V3 / Organizer O7: draft-round deletion is consequential state, not a
-- convenient service-role CRUD shortcut. Open/close/draft already use the
-- canonical operation receipt + optimistic concurrency contract; deletion must
-- have the same lost-response/replay behavior and must not erase ballot/result
-- history merely because somebody moved a round back to "draft" first.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.televote.round-delete-operation',
  1,
  'forward_fix_only',
  false,
  null,
  'Add governed Televote draft-round deletion preflight/apply contracts with exact canonical edition scope, version CAS, idempotent replay and historical-data blockers. Existing Organizer caller remains compatible until explicit cutover.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function televoting.studio2_round_delete_preview(
  p_round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $preview$
declare
  v_round televoting.rounds%rowtype;
  v_binding public.televoting_round_bindings%rowtype;
  v_linked_edition_id uuid;
  v_global_version bigint := 0;
  v_round_version bigint := 0;
  v_entry_count integer := 0;
  v_ballot_count integer := 0;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_round_id is null then
    raise exception 'Voting round is required' using errcode = '22023';
  end if;

  select *
  into v_round
  from televoting.rounds r
  where r.id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select *
  into v_binding
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;

  if v_binding.remote_round_id is null then
    raise exception 'Voting round is not bound to a canonical Solaris edition'
      using errcode = 'P0002';
  end if;

  if v_binding.remote_edition_id is distinct from v_round.edition_id::text then
    raise exception 'Voting round binding does not match its remote edition'
      using errcode = 'PT409';
  end if;

  select link.solaris_id
  into v_linked_edition_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.remote_id = v_round.edition_id::text
  limit 1;

  if v_linked_edition_id is null
     or v_linked_edition_id is distinct from v_binding.edition_id then
    raise exception 'Voting round canonical edition link is inconsistent'
      using errcode = 'PT409';
  end if;

  if not public.studio2_access_allowed(
    'voting.manage',
    v_binding.edition_id,
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

  -- Count every persisted ballot row, including rows later marked deleted. The
  -- round FK cascades, so deleting a round with any ballot history would erase
  -- official/integrity evidence. Draft status is not permission to do that.
  select count(*)::integer
  into v_ballot_count
  from televoting.vote_submissions submission
  where submission.round_id = p_round_id;

  if v_round.status <> 'draft' then
    v_blockers := v_blockers || jsonb_build_array(
      'Only draft voting rounds can be deleted.'
    );
  end if;

  if v_ballot_count > 0 then
    v_blockers := v_blockers || jsonb_build_array(
      'Voting rounds with ballot history cannot be deleted. Preserve the historical record instead.'
    );
  end if;

  if coalesce(v_round.calculation_version, 0) > 0
     or v_round.results_status <> 'draft' then
    v_blockers := v_blockers || jsonb_build_array(
      'Voting rounds with calculated or non-draft result state cannot be deleted.'
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'riskClass', 'R2',
    'roundId', v_round.id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_binding.edition_id,
    'currentStatus', v_round.status,
    'expectedGlobalVersion', v_global_version,
    'expectedRoundVersion', v_round_version,
    'entryCount', v_entry_count,
    'ballotCount', v_ballot_count,
    'resultsStatus', v_round.results_status,
    'calculationVersion', v_round.calculation_version,
    'affected', jsonb_build_object(
      'rounds', 1,
      'bindings', 1,
      'entries', v_entry_count
    ),
    'blockers', v_blockers,
    'canDelete', jsonb_array_length(v_blockers) = 0,
    'serverTime', now()
  );
end
$preview$;

revoke all on function televoting.studio2_round_delete_preview(uuid)
  from public, anon;
grant execute on function televoting.studio2_round_delete_preview(uuid)
  to authenticated, service_role;

create or replace function televoting.studio2_apply_round_delete(
  p_round_id uuid,
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
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_round televoting.rounds%rowtype;
  v_binding public.televoting_round_bindings%rowtype;
  v_existing_scope jsonb;
  v_solaris_edition_id uuid;
  v_linked_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_global bigint := 0;
  v_current_round bigint := 0;
  v_next_global bigint := 0;
  v_entry_count integer := 0;
  v_ballot_count integer := 0;
  v_result jsonb;
begin
  if p_round_id is null
     or p_operation_id is null
     or v_key is null
     or p_expected_global_version is null
     or p_expected_round_version is null
     or p_expected_global_version < 0
     or p_expected_round_version < 0 then
    raise exception 'Round, operation identity and expected televote versions are required'
      using errcode = '22023';
  end if;

  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Deletion removes the object needed to rediscover edition scope. Recover the
  -- original exact scope from an existing receipt first so a lost successful
  -- response can still replay rather than degrading into "Round not found".
  select receipt.scope
  into v_existing_scope
  from public.studio2_operation_receipts receipt
  where receipt.actor_id = v_actor
    and receipt.command = 'televote.round.delete'
    and (
      receipt.operation_id = p_operation_id
      or receipt.idempotency_key = v_key
    )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1;

  if v_existing_scope is not null then
    begin
      v_solaris_edition_id := nullif(v_existing_scope ->> 'solarisEditionId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Stored Televote delete receipt scope is invalid'
        using errcode = 'PT409';
    end;
  else
    select *
    into v_round
    from televoting.rounds r
    where r.id = p_round_id;

    if v_round.id is null then
      raise exception 'Voting round not found' using errcode = 'P0002';
    end if;

    select *
    into v_binding
    from public.televoting_round_bindings binding
    where binding.remote_round_id = p_round_id::text;

    if v_binding.remote_round_id is null then
      raise exception 'Voting round is not bound to a canonical Solaris edition'
        using errcode = 'P0002';
    end if;

    if v_binding.remote_edition_id is distinct from v_round.edition_id::text then
      raise exception 'Voting round binding does not match its remote edition'
        using errcode = 'PT409';
    end if;

    v_solaris_edition_id := v_binding.edition_id;
  end if;

  if v_solaris_edition_id is null then
    raise exception 'Voting round canonical edition scope is unavailable'
      using errcode = 'PT409';
  end if;

  if not public.studio2_access_allowed(
    'voting.manage',
    v_solaris_edition_id,
    false
  ) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  -- S2 semantic claim happens before mutable current-state validation. Replays
  -- therefore return the original successful receipt even though the round has
  -- intentionally disappeared. The exact reviewed versions remain in the
  -- semantic fingerprint, so reusing the key for a different review is denied.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    p_operation_id,
    'televote.round.delete',
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_solaris_edition_id
    ),
    jsonb_build_object(
      'expectedGlobalVersion', p_expected_global_version,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim -> 'result' is null then
      raise exception 'Existing Televote round deletion has no completed result yet'
        using errcode = 'PT409';
    end if;
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-televote-round-state', 0)
  );

  select *
  into v_round
  from televoting.rounds r
  where r.id = p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Voting round changed since this delete review was loaded. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  select *
  into v_binding
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text
  for update;

  if v_binding.remote_round_id is null
     or v_binding.edition_id is distinct from v_solaris_edition_id
     or v_binding.remote_edition_id is distinct from v_round.edition_id::text then
    raise exception 'Voting round binding changed since this delete review was loaded. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  select link.solaris_id
  into v_linked_edition_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.remote_id = v_round.edition_id::text
  limit 1;

  if v_linked_edition_id is null
     or v_linked_edition_id is distinct from v_solaris_edition_id then
    raise exception 'Voting round canonical edition link changed since review'
      using errcode = 'PT409';
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
    raise exception 'Televote round state changed since this delete review was loaded. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  if v_round.status <> 'draft' then
    raise exception 'Only draft voting rounds can be deleted'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into v_entry_count
  from televoting.round_entries entry
  where entry.round_id = p_round_id;

  select count(*)::integer
  into v_ballot_count
  from televoting.vote_submissions submission
  where submission.round_id = p_round_id;

  if v_ballot_count > 0 then
    raise exception 'Voting rounds with ballot history cannot be deleted'
      using errcode = '23514';
  end if;

  if coalesce(v_round.calculation_version, 0) > 0
     or v_round.results_status <> 'draft' then
    raise exception 'Voting rounds with calculated or non-draft result state cannot be deleted'
      using errcode = '23514';
  end if;

  -- public.televoting_round_bindings and televoting.rounds live in the same
  -- PostgreSQL transaction. Delete both here, rather than making the Node server
  -- perform a fragile cross-step cleanup. Draft entries may cascade; ballot and
  -- result history is explicitly blocked above.
  delete from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text
    and binding.edition_id = v_solaris_edition_id;

  if not found then
    raise exception 'Voting round binding disappeared during deletion'
      using errcode = 'PT409';
  end if;

  delete from televoting.rounds r
  where r.id = p_round_id;

  if not found then
    raise exception 'Voting round disappeared during deletion'
      using errcode = 'PT409';
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
    v_actor,
    coalesce(
      auth.jwt() ->> 'email',
      auth.jwt() -> 'user_metadata' ->> 'display_name',
      v_actor::text
    ),
    'delete_round',
    'round',
    p_round_id::text,
    jsonb_build_object(
      'id', v_round.id,
      'name', v_round.name,
      'status', v_round.status,
      'remoteEditionId', v_round.edition_id,
      'solarisEditionId', v_solaris_edition_id,
      'entryCount', v_entry_count,
      'ballotCount', v_ballot_count,
      'resultsStatus', v_round.results_status,
      'calculationVersion', v_round.calculation_version
    ),
    jsonb_build_object(
      'deleted', true,
      'operationId', v_operation_id
    )
  );

  select coalesce(version, v_current_global)
  into v_next_global
  from public.studio2_televote_global_versions
  where singleton = true;

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'roundId', p_round_id,
    'roundName', v_round.name,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_solaris_edition_id,
    'operationId', v_operation_id,
    'deleted', true,
    'entryCount', v_entry_count,
    'ballotCount', v_ballot_count,
    'previousGlobalVersion', v_current_global,
    'globalVersion', v_next_global,
    'previousRoundVersion', v_current_round,
    'roundVersion', null,
    'serverTime', now()
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_round_delete(
  uuid, uuid, text, bigint, bigint
) from public, anon;
grant execute on function televoting.studio2_apply_round_delete(
  uuid, uuid, text, bigint, bigint
) to authenticated, service_role;

comment on function televoting.studio2_round_delete_preview(uuid) is
  'R2 exact-round Televote deletion preflight. Requires canonical edition binding and voting.manage; blocks ballot/result history and returns global+round versions for reviewed commit.';
comment on function televoting.studio2_apply_round_delete(uuid, uuid, text, bigint, bigint) is
  'R2 governed Televote draft-round deletion. Replays successful deletion by operation/idempotency identity, CAS-checks reviewed versions, atomically removes canonical binding + remote draft round, preserves ballot/result history, audits and returns an S2 receipt.';

notify pgrst, 'reload schema';

commit;
