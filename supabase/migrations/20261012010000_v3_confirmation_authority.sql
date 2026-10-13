begin;

-- V3 Confirmation authority boundary.
--
-- The legacy public.submit_confirmation(jsonb) RPC remains intact. V3 wraps it
-- in an atomic idempotency/receipt boundary so an ambiguous HTTP outcome can be
-- reconciled without replaying the protected mutation blindly.

create table if not exists private.v3_confirmation_operations (
  idempotency_key uuid primary key,
  request_hash text not null,
  round_id uuid not null references public.submission_rounds(id) on delete cascade,
  browser_session_id text not null,
  result jsonb not null,
  receipt_id uuid not null unique default gen_random_uuid(),
  accepted_at timestamptz not null default now(),
  constraint v3_confirmation_operations_request_hash_not_blank
    check (length(btrim(request_hash)) > 0),
  constraint v3_confirmation_operations_browser_session_not_blank
    check (length(btrim(browser_session_id)) > 0)
);

revoke all on table private.v3_confirmation_operations
  from public, anon, authenticated;
grant all on table private.v3_confirmation_operations to service_role;

create index if not exists v3_confirmation_operations_session_round_idx
  on private.v3_confirmation_operations(browser_session_id, round_id, accepted_at desc);

create or replace function public.v3_submit_confirmation(
  payload jsonb,
  _idempotency_key uuid,
  _request_hash text,
  _browser_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $submit$
declare
  v_round_id uuid;
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
  if nullif(btrim(coalesce(_request_hash, '')), '') is null then
    raise exception 'Confirmation request hash is required' using errcode = '22023';
  end if;
  if length(_request_hash) > 128 then
    raise exception 'Confirmation request hash is too long' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;

  begin
    v_round_id := nullif(payload ->> 'round_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Confirmation round id is invalid' using errcode = '22023';
  end;
  if v_round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;

  -- One key has exactly one serializer. This protects the read -> legacy submit
  -- -> receipt insert sequence even when duplicate requests arrive concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended('v3-confirmation:' || _idempotency_key::text, 0)
  );

  select operation.*
  into v_existing
  from private.v3_confirmation_operations operation
  where operation.idempotency_key = _idempotency_key;

  if found then
    if v_existing.request_hash <> _request_hash
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

  -- Keep all legacy validation, duplicate protection and requirement semantics
  -- in one place. Because this call and the ledger insert are the same database
  -- transaction, either both commit or both roll back.
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
    _request_hash,
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
      'request_hash', _request_hash,
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

create or replace function public.v3_reconcile_confirmation(
  _idempotency_key uuid,
  _browser_session_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $reconcile$
  select coalesce((
    select operation.result || jsonb_build_object(
      'found', true,
      'receipt', jsonb_build_object(
        'authority', 'authoritative_server',
        'receipt_id', operation.receipt_id,
        'idempotency_key', operation.idempotency_key,
        'request_hash', operation.request_hash,
        'round_id', operation.round_id,
        'accepted_at', operation.accepted_at,
        'replayed', true
      )
    )
    from private.v3_confirmation_operations operation
    where operation.idempotency_key = _idempotency_key
      and operation.browser_session_id = _browser_session_id
  ), jsonb_build_object('found', false));
$reconcile$;

revoke all on function public.v3_reconcile_confirmation(uuid, text)
  from public;
grant execute on function public.v3_reconcile_confirmation(uuid, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Revision-safe server drafts.
--
-- Keep the historical submission_drafts table as the single draft store. A
-- revision trigger observes legacy writers too, so a V3 compare-and-swap cannot
-- silently overwrite a draft changed by an older client in another tab/device.
-- ---------------------------------------------------------------------------
alter table public.submission_drafts
  add column if not exists v3_revision bigint not null default 0;

create or replace function private.v3_bump_confirmation_draft_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
begin
  if new.payload is distinct from old.payload then
    new.v3_revision := old.v3_revision + 1;
  else
    new.v3_revision := old.v3_revision;
  end if;
  return new;
end
$bump$;

revoke all on function private.v3_bump_confirmation_draft_revision()
  from public, anon, authenticated;

drop trigger if exists v3_confirmation_draft_revision
  on public.submission_drafts;
create trigger v3_confirmation_draft_revision
before update of payload on public.submission_drafts
for each row
execute function private.v3_bump_confirmation_draft_revision();

create or replace function public.v3_load_confirmation_draft(
  _round_id uuid,
  _browser_session_id text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $load$
  select coalesce((
    select jsonb_build_object(
      'found', true,
      'payload', draft.payload,
      'revision', draft.v3_revision,
      'updated_at', draft.updated_at
    )
    from public.submission_drafts draft
    where draft.round_id = _round_id
      and draft.browser_session_id = _browser_session_id
  ), jsonb_build_object(
    'found', false,
    'revision', 0
  ));
$load$;

revoke all on function public.v3_load_confirmation_draft(uuid, text)
  from public;
grant execute on function public.v3_load_confirmation_draft(uuid, text)
  to anon, authenticated, service_role;

create or replace function public.v3_save_confirmation_draft(
  _round_id uuid,
  _browser_session_id text,
  _payload jsonb,
  _expected_revision bigint,
  _instagram_username text,
  _country text,
  _ip text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_existing public.submission_drafts%rowtype;
  v_saved public.submission_drafts%rowtype;
  v_expected bigint := coalesce(_expected_revision, 0);
begin
  if _round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(_browser_session_id, '')), '') is null
     or length(_browser_session_id) > 80 then
    raise exception 'Confirmation browser session is invalid' using errcode = '22023';
  end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'Confirmation draft payload must be a JSON object' using errcode = '22023';
  end if;
  if v_expected < 0 then
    raise exception 'Confirmation draft revision cannot be negative' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'v3-confirmation-draft:' || _round_id::text || ':' || _browser_session_id,
      0
    )
  );

  select draft.*
  into v_existing
  from public.submission_drafts draft
  where draft.round_id = _round_id
    and draft.browser_session_id = _browser_session_id
  for update;

  if found then
    if v_existing.v3_revision <> v_expected then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', v_existing.v3_revision,
        'payload', v_existing.payload,
        'updated_at', v_existing.updated_at
      );
    end if;

    update public.submission_drafts draft
    set
      payload = _payload,
      instagram_username = nullif(btrim(_instagram_username), ''),
      country = nullif(btrim(_country), ''),
      latest_ip = nullif(btrim(_ip), ''),
      updated_at = now()
    where draft.id = v_existing.id
    returning draft.* into v_saved;
  else
    if v_expected <> 0 then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', 0,
        'payload', null,
        'updated_at', null
      );
    end if;

    insert into public.submission_drafts (
      round_id,
      browser_session_id,
      payload,
      instagram_username,
      country,
      initial_ip,
      latest_ip,
      v3_revision,
      created_at,
      updated_at
    ) values (
      _round_id,
      _browser_session_id,
      _payload,
      nullif(btrim(_instagram_username), ''),
      nullif(btrim(_country), ''),
      nullif(btrim(_ip), ''),
      nullif(btrim(_ip), ''),
      1,
      now(),
      now()
    )
    returning * into v_saved;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'revision', v_saved.v3_revision,
    'saved_at', v_saved.updated_at
  );
end
$save$;

revoke all on function public.v3_save_confirmation_draft(uuid, text, jsonb, bigint, text, text, text)
  from public;
grant execute on function public.v3_save_confirmation_draft(uuid, text, jsonb, bigint, text, text, text)
  to anon, authenticated, service_role;

commit;