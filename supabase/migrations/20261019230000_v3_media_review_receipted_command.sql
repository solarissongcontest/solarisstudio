begin;

-- V3 O5 / System: the legacy Media Review compatibility RPC is already
-- transactional, source-fingerprint protected and internally deduplicated by a
-- derived semantic fingerprint. What it cannot give a modern Organizer client
-- is a caller-owned operation identity that survives a lost response.
--
-- Add an explicit V3 command without replacing the working compatibility RPC.
-- The canonical review rows are still written by the existing legacy impl;
-- this function adds caller-provided operation/idempotency identity and returns
-- an authoritative receipt envelope. The operation receipt result intentionally
-- remains the review-array shape expected by the existing S5 media DomainEvent
-- trigger, so we do not fork consequence semantics.

create or replace function public.studio2_review_media_assets_v3(
  p_edition_id uuid,
  p_reviews jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth, public, private, extensions
as $review$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_reviews jsonb;
  v_replayed boolean := false;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if p_edition_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or jsonb_typeof(p_reviews) <> 'array'
     or jsonb_array_length(p_reviews) < 1
     or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Keep the operation request semantic and secret-free. Source fingerprints
  -- are canonical media identities, not credential material.
  v_scope := jsonb_build_object('editionId', p_edition_id);
  v_request := jsonb_build_object(
    'reviews', p_reviews,
    'reason', v_reason
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'media.review',
    'R1',
    v_scope,
    v_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' <> 'succeeded'
       or jsonb_typeof(v_claim -> 'result') <> 'array' then
      return v_claim;
    end if;

    v_reviews := v_claim -> 'result';
    v_replayed := true;
  else
    -- Preserve the existing exact-edition authorization, per-edition
    -- serialization, canonical source re-read, source-fingerprint stale check,
    -- duplicate-key validation and atomic review-row/event behavior.
    v_reviews := public.studio2_review_media_assets_legacy_impl(
      p_edition_id,
      p_reviews,
      v_reason
    );

    if jsonb_typeof(v_reviews) <> 'array'
       or jsonb_array_length(v_reviews) < 1 then
      raise exception 'Media Review returned no canonical review evidence'
        using errcode = '23514';
    end if;

    -- The existing S5 `media.reviewed` receipt trigger consumes the operation
    -- result as an array. Store exactly that canonical result and add envelope
    -- metadata only to this RPC response.
    perform private.studio2_complete_operation(p_operation_id, v_reviews);
  end if;

  return jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'editionId', p_edition_id,
    'reviews', v_reviews,
    'replayed', v_replayed,
    'serverTime', now()
  );
end
$review$;

revoke all on function public.studio2_review_media_assets_v3(
  uuid, jsonb, text, uuid, text
) from public, anon;
grant execute on function public.studio2_review_media_assets_v3(
  uuid, jsonb, text, uuid, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
