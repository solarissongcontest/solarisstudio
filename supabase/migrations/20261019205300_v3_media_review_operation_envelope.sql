begin;

-- System V3 / O5: expose Media Review through the canonical caller-owned
-- operation envelope without breaking the existing three-argument compatibility
-- RPC used by current Organizer and S14 rehearsal callers.
--
-- The existing legacy implementation remains the single canonical media review
-- writer/validator. This migration only adds stable caller operation identity,
-- semantic idempotency, authoritative receipts and lost-response reconciliation.
--
-- S13 contract: additive forward fix only. No destructive DDL and no backfill.
select public.v3_register_migration_contract(
  '20261019205300_v3_media_review_operation_envelope',
  1,
  'forward_fix_only',
  false,
  null,
  'Caller-owned idempotent Media Review operation envelope and receipt'
);

create or replace function public.studio2_review_media_assets_v3(
  p_edition_id uuid,
  p_reviews jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $review_v3$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_scope jsonb;
  v_semantic_request jsonb;
  v_claim jsonb;
  v_claim_status text;
  v_canonical_operation_id uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(p_reviews) <> 'array' or jsonb_array_length(p_reviews) < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not private.studio2_can_manage_media_assets(v_actor, p_edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_scope := jsonb_build_object('editionId', p_edition_id);
  v_semantic_request := jsonb_build_object(
    'reviews', p_reviews,
    'reason', v_reason
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'media.review',
    'R1',
    v_scope,
    v_semantic_request
  );

  begin
    v_canonical_operation_id := nullif(v_claim ->> 'operationId', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end;

  if v_canonical_operation_id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_claim_status := nullif(v_claim ->> 'status', '');

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim_status = 'succeeded' then
      v_result := coalesce(v_claim -> 'result', '[]'::jsonb);
      if jsonb_typeof(v_result) <> 'array' then
        raise exception using errcode = 'P0001', message = 'DATABASE';
      end if;

      return jsonb_build_object(
        'ok', true,
        'operationId', v_canonical_operation_id,
        'receiptId', v_canonical_operation_id,
        'correlationId', coalesce(v_claim -> 'correlationId', to_jsonb(v_canonical_operation_id)),
        'editionId', p_edition_id,
        'status', 'succeeded',
        'reviews', v_result,
        'replayed', true,
        'serverTime', now()
      );
    end if;

    -- A replayed operation that is still processing, uncertain or failed must
    -- never re-enter the canonical writer. The caller reconciles the original
    -- operationId instead of creating a second semantic review attempt.
    return jsonb_strip_nulls(jsonb_build_object(
      'ok', false,
      'operationId', v_canonical_operation_id,
      'receiptId', v_canonical_operation_id,
      'correlationId', v_claim -> 'correlationId',
      'editionId', p_edition_id,
      'status', coalesce(v_claim_status, 'unknown'),
      'error', v_claim -> 'error',
      'replayed', true,
      'serverTime', now()
    ));
  end if;

  if v_claim_status is distinct from 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  -- Keep one authoritative writer. The legacy implementation owns canonical
  -- source re-read, source-fingerprint stale detection, per-edition locking,
  -- supersession history and review-row creation. It is not browser executable.
  v_result := public.studio2_review_media_assets_legacy_impl(
    p_edition_id,
    p_reviews,
    v_reason
  );

  if jsonb_typeof(coalesce(v_result, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  -- Completing the existing media.review receipt also drives the already
  -- installed media.reviewed DomainEvent trigger/outbox consequences exactly
  -- once. The receipt result deliberately remains the canonical review array so
  -- old reconciliation/event consumers do not gain a second result shape.
  v_result := private.studio2_complete_operation(
    v_canonical_operation_id,
    coalesce(v_result, '[]'::jsonb)
  );

  return jsonb_build_object(
    'ok', true,
    'operationId', v_canonical_operation_id,
    'receiptId', v_canonical_operation_id,
    'correlationId', coalesce(p_correlation_id, v_canonical_operation_id),
    'editionId', p_edition_id,
    'status', 'succeeded',
    'reviews', v_result,
    'replayed', false,
    'serverTime', now()
  );
end
$review_v3$;

comment on function public.studio2_review_media_assets_v3(uuid, jsonb, text, uuid, text, uuid)
is 'Canonical V3 Organizer Media Review command with caller operation identity, semantic idempotency, receipt and reconciliation support.';

revoke all on function public.studio2_review_media_assets_v3(uuid, jsonb, text, uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.studio2_review_media_assets_v3(uuid, jsonb, text, uuid, text, uuid)
  to authenticated;

commit;
