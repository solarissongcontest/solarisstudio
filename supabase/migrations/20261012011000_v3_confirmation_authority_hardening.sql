begin;

-- Harden the public V3 wrapper against direct RPC callers. The first migration
-- established the contract; this definition makes the database itself the
-- authority for request identity rather than trusting a caller-supplied hash.

create or replace function public.v3_submit_confirmation(
  payload jsonb,
  _idempotency_key uuid,
  _request_hash text,
  _browser_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $submit$
declare
  v_round_id uuid;
  v_request_hash text;
  v_payload_session text;
  v_existing private.v3_confirmation_operations%rowtype;
  v_result jsonb;
  v_receipt_id uuid;
  v_accepted_at timestamptz;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Confirmation payload must be a JSON object' using errcode = '22023';
  end if;
  if _idempotency_key is null then
    raise exception 'Confirmation idempotency key is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;

  v_payload_session := nullif(btrim(coalesce(payload ->> 'browser_session_id', '')), '');
  if v_payload_session is null or v_payload_session <> _browser_session_id then
    raise exception 'Confirmation browser-session scope does not match payload'
      using errcode = '22023';
  end if;

  begin
    v_round_id := nullif(payload ->> 'round_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Confirmation round id is invalid' using errcode = '22023';
  end;
  if v_round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;

  -- jsonb::text is deterministic for the logical object. Network metadata is
  -- excluded so the same dispatched operation can reconcile after an IP change.
  v_request_hash := encode(
    extensions.digest(
      convert_to((payload - 'client_ip')::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- `_request_hash` remains in the signature for the already-shipped adapter,
  -- but is deliberately not trusted as receipt authority.
  perform _request_hash;

  perform pg_advisory_xact_lock(
    hashtextextended('v3-confirmation:' || _idempotency_key::text, 0)
  );

  select operation.*
  into v_existing
  from private.v3_confirmation_operations operation
  where operation.idempotency_key = _idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash
       or v_existing.round_id <> v_round_id
       or v_existing.browser_session_id <> _browser_session_id then
      raise exception 'Confirmation idempotency key was already used for a different request'
        using errcode = '22023';
    end if;

    return v_existing.result || jsonb_build_object(
      'receipt', jsonb_build_object(
        'authority', 'authoritative_server',
        'receipt_id', v_existing.receipt_id,
        'idempotency_key', v_existing.idempotency_key,
        'request_hash', v_existing.request_hash,
        'round_id', v_existing.round_id,
        'accepted_at', v_existing.accepted_at,
        'replayed', true
      )
    );
  end if;

  select to_jsonb(public.submit_confirmation(payload)) into v_result;
  if v_result is null then
    raise exception 'Confirmation submit returned no result' using errcode = '55000';
  end if;

  v_receipt_id := gen_random_uuid();
  v_accepted_at := now();

  insert into private.v3_confirmation_operations (
    idempotency_key,
    request_hash,
    round_id,
    browser_session_id,
    result,
    receipt_id,
    accepted_at
  ) values (
    _idempotency_key,
    v_request_hash,
    v_round_id,
    _browser_session_id,
    v_result,
    v_receipt_id,
    v_accepted_at
  );

  return v_result || jsonb_build_object(
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'receipt_id', v_receipt_id,
      'idempotency_key', _idempotency_key,
      'request_hash', v_request_hash,
      'round_id', v_round_id,
      'accepted_at', v_accepted_at,
      'replayed', false
    )
  );
end
$submit$;

revoke all on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  from public;
grant execute on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  to anon, authenticated, service_role;

commit;