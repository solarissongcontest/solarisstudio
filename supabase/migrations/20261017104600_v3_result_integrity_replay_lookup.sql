begin;

-- System V3: read-only replay gate for the governed Result Integrity recompute.
--
-- A caller can lose the first HTTP response after the canonical S2 operation
-- has committed. The round may then advance before the caller retries. Looking
-- at current round state before consulting the durable receipt would turn a
-- successful exact retry into a stale-version failure. This helper resolves the
-- existing operation identity first, without creating a receipt or re-reading
-- mutable voting state.

create or replace function televoting.studio2_replay_result_integrity_recompute(
  p_solaris_edition_id uuid,
  p_round_id uuid,
  p_expected_calculation_version integer,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $replay$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_scope jsonb;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_solaris_edition_id is null
     or p_round_id is null
     or p_expected_calculation_version is null
     or p_expected_calculation_version <= 0
     or p_operation_id is null
     or v_key is null
     or length(v_key) > 240 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Match the apply boundary's authorization semantics. A durable receipt does
  -- not become a way to read governed voting-operation results after access is
  -- revoked.
  if not public.studio2_access_allowed('voting.manage', p_solaris_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_scope := jsonb_build_object(
    'solarisEditionId', p_solaris_edition_id,
    'roundId', p_round_id
  );

  -- Mirror the canonical S2 claim lookup order: exact operation id first, then
  -- the current actor's command + idempotency key. This is read-only and does
  -- not inspect the current round/calculation row.
  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = 'televote.result_integrity.recompute'
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1;

  if v_receipt.operation_id is null then
    return jsonb_build_object('found', false);
  end if;

  if v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'televote.result_integrity.recompute'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.risk_class is distinct from 'R2'
     or v_receipt.scope is distinct from v_scope then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Use the original Result Integrity request or a new idempotency key.';
  end if;

  if v_receipt.status = 'succeeded' then
    v_result := v_receipt.result;
    if jsonb_typeof(v_result) <> 'object'
       or v_result ->> 'operationId' is distinct from v_receipt.operation_id::text
       or v_result ->> 'solarisEditionId' is distinct from p_solaris_edition_id::text
       or v_result ->> 'roundId' is distinct from p_round_id::text
       or jsonb_typeof(v_result -> 'calculationVersion') <> 'number'
       or v_result ->> 'calculationVersion' is distinct from p_expected_calculation_version::text then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_CONFLICT',
        hint = 'The durable operation receipt does not match this Result Integrity request.';
    end if;
  end if;

  return jsonb_build_object(
    'found', true,
    'operationId', v_receipt.operation_id,
    'correlationId', v_receipt.correlation_id,
    'status', v_receipt.status,
    'result', v_receipt.result,
    'error', case
      when v_receipt.error_code is null then null
      else jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      )
    end
  );
end
$replay$;

revoke all on function televoting.studio2_replay_result_integrity_recompute(
  uuid, uuid, integer, uuid, text
) from public, anon;
grant execute on function televoting.studio2_replay_result_integrity_recompute(
  uuid, uuid, integer, uuid, text
) to authenticated, service_role;

comment on function televoting.studio2_replay_result_integrity_recompute(
  uuid, uuid, integer, uuid, text
) is
  'Read-only actor-scoped lost-response replay lookup for the governed Result Integrity recompute. It validates stable request scope without consulting mutable round state.';

notify pgrst, 'reload schema';

commit;
