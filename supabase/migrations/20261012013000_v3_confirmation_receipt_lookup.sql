begin;

-- Allow the browser to turn the legacy form's accepted submission event into
-- the authoritative V3 receipt without exposing the private receipt ledger.
-- The lookup requires the exact round, browser session and accepted submission
-- UUID, so it cannot be used as a receipt enumeration endpoint.
create or replace function public.v3_lookup_confirmation_receipt(
  _round_id uuid,
  _browser_session_id text,
  _submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $lookup$
declare
  v_operation private.v3_confirmation_operations%rowtype;
begin
  if _round_id is null or _submission_id is null then
    raise exception 'Confirmation receipt context is incomplete' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;

  select operation.*
  into v_operation
  from private.v3_confirmation_operations operation
  where operation.round_id = _round_id
    and operation.browser_session_id = _browser_session_id
    and operation.result ->> 'submission_id' = _submission_id::text
  order by operation.accepted_at desc
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'receipt_id', v_operation.receipt_id,
      'idempotency_key', v_operation.idempotency_key,
      'request_hash', v_operation.request_hash,
      'round_id', v_operation.round_id,
      'accepted_at', v_operation.accepted_at,
      'replayed', true
    )
  );
end
$lookup$;

revoke all on function public.v3_lookup_confirmation_receipt(uuid, text, uuid)
  from public;
grant execute on function public.v3_lookup_confirmation_receipt(uuid, text, uuid)
  to anon, authenticated, service_role;

commit;
