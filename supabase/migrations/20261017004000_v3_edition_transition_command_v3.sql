begin;

-- Solaris Studio V3 / #587: canonical governed edition lifecycle command.
--
-- One browser-callable authority owns every edition lifecycle transition. The
-- command binds the mutation to the exact runtime version reviewed by the
-- operator, uses caller-stable operation/idempotency identity, preserves the
-- existing second-operator approval semantics, and returns a durable receipt
-- result that can be reconciled after an uncertain transport outcome.

create or replace function public.studio2_transition_edition_v3(
  p_edition_id uuid,
  p_to text,
  p_reason text,
  p_approval_request_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $transition$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_required_capability text;
  v_claim_risk text;
  v_claim jsonb;
  v_runtime public.studio2_edition_runtime%rowtype;
  v_from text;
  v_risk text;
  v_approval public.studio2_transition_approval_requests%rowtype;
  v_result jsonb;
  v_server_time timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or nullif(btrim(coalesce(p_to, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_operation_id is null
     or v_key is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Successful critical transitions necessarily carry an approval request and
  -- therefore enter the operation ledger as R3. All other lifecycle changes
  -- remain consequential R2 commands. Invalid approval usage rolls back the
  -- claim together with the transaction.
  v_claim_risk := case when p_approval_request_id is null then 'R2' else 'R3' end;

  -- Claim before evaluating mutable runtime state. This is what makes an exact
  -- retry after a committed transition replay the original receipt instead of
  -- failing merely because the runtime has already advanced.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    p_operation_id,
    'edition.transition',
    v_claim_risk,
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'to', p_to,
      'reason', v_reason,
      'approvalRequestId', p_approval_request_id,
      'expectedRuntimeVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = 'Edition transition operation exists but is not in a replayable succeeded state.';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id
  for update;

  if v_runtime.edition_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'STATE_CHANGED',
      detail = 'Canonical edition runtime does not exist.';
  end if;

  if v_runtime.version is distinct from p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = format(
        'Expected edition runtime version %s, current version is %s.',
        p_expected_version,
        v_runtime.version
      ),
      hint = 'Reload the Control Room and review the current lifecycle state before trying again.';
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  if v_risk is null then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = format('Edition cannot transition from %s to %s.', v_from, p_to);
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = format('A reason is required for %s edition transitions.', v_risk);
  end if;

  if v_risk = 'critical' then
    if p_approval_request_id is null then
      raise exception using
        errcode = '42501',
        message = 'AUTHORIZATION',
        detail = 'An approved second-person request is required for critical edition transitions.';
    end if;

    select approval.*
    into v_approval
    from public.studio2_transition_approval_requests approval
    where approval.id = p_approval_request_id
    for update;

    if v_approval.id is null
       or v_approval.edition_id <> p_edition_id
       or v_approval.from_state <> v_from
       or v_approval.to_state <> p_to
       or v_approval.requested_by <> v_actor
       or v_approval.approved_by is null
       or v_approval.approved_by = v_actor
       or v_approval.approved_at is null
       or v_approval.consumed_at is not null
       or v_approval.expires_at <= now()
       or v_approval.reason <> v_reason then
      raise exception using
        errcode = '42501',
        message = 'AUTHORIZATION',
        detail = 'Critical transition approval is missing, stale, mismatched, or already consumed.';
    end if;
  elsif p_approval_request_id is not null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Approval request ids are only valid for critical transitions.';
  end if;

  -- #697 protects Archive at the canonical runtime boundary. The GUC is local
  -- to this transaction and permits only this governed command to cross that
  -- boundary while leaving direct/legacy Archive writes fail-closed.
  if p_to = 'archived' then
    perform set_config('solaris.v3_archive_command', 'allowed', true);
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
    and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.edition_id is null then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_risk = 'critical' then
    update public.studio2_transition_approval_requests
    set consumed_at = now()
    where id = v_approval.id
      and consumed_at is null;

    if not found then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
  end if;

  v_server_time := clock_timestamp();

  insert into public.studio2_contest_events (
    edition_id,
    type,
    actor_user_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end,
      'operationId', p_operation_id,
      'previousRuntimeVersion', p_expected_version,
      'runtimeVersion', v_runtime.version
    )
  );

  if p_to = 'archived' then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
    ) values (
      p_edition_id,
      'edition.archived',
      v_actor,
      'edition',
      p_edition_id::text,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'operationId', p_operation_id,
        'previousRuntimeVersion', p_expected_version,
        'runtimeVersion', v_runtime.version
      )
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'editionId', p_edition_id,
    'from', v_from,
    'previousRuntimeVersion', p_expected_version,
    'state', v_runtime.state,
    'runtimeVersion', v_runtime.version,
    'serverTime', v_server_time,
    'replayed', false,
    'runtime', to_jsonb(v_runtime)
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);

  perform private.v3_emit_domain_event(
    'edition.state_changed',
    'edition',
    p_edition_id::text,
    v_runtime.version,
    p_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end,
      'previousRuntimeVersion', p_expected_version,
      'runtimeVersion', v_runtime.version,
      'lifecycleAuthority', 'studio2_edition_runtime'
    ),
    1,
    array[]::text[]
  );

  if p_to = 'archived' then
    perform private.v3_emit_domain_event(
      'edition.archived',
      'edition',
      p_edition_id::text,
      v_runtime.version,
      p_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'previousRuntimeVersion', p_expected_version,
        'runtimeVersion', v_runtime.version,
        'legacyStatus', (
          select edition.status
          from public.editions edition
          where edition.id = p_edition_id
        ),
        'lifecycleAuthority', 'studio2_edition_runtime'
      ),
      1,
      array['edition.tasks']::text[]
    );
  end if;

  return v_result;
end
$transition$;

-- V3 is now the only browser-callable edition lifecycle mutation authority.
-- Keep the older functions available to service-role maintenance/rehearsal code
-- during the migration window, but authenticated clients cannot bypass the
-- expected-version/idempotency contract.
revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  to service_role;

revoke all on function public.studio2_archive_edition_v3(uuid, bigint, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_archive_edition_v3(uuid, bigint, uuid, text, text)
  to service_role;

revoke all on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) from public, anon;
grant execute on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) to authenticated, service_role;

comment on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) is
  'Canonical V3 edition lifecycle mutation authority. Requires reviewed runtime version plus stable operation/idempotency identity; returns a durable reconciliable receipt result.';

notify pgrst, 'reload schema';

commit;
