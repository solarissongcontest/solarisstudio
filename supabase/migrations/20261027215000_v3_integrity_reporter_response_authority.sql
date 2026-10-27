begin;

select public.v3_register_migration_contract(
  'v3.integrity.reporter-response-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Make reporter responses retry-safe canonical case operations so waiting_for_reporter -> under_review cannot bypass case revision/event authority'
);

alter function public.reporter_reply_integrity_case(uuid, text)
  rename to reporter_reply_integrity_case_impl;
alter function public.public_reply_anonymous_integrity_case(text, text, text)
  rename to public_reply_anonymous_integrity_case_impl;

revoke all on function public.reporter_reply_integrity_case_impl(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.public_reply_anonymous_integrity_case_impl(text, text, text)
  from public, anon, authenticated, service_role;

create table if not exists private.v3_anonymous_integrity_response_operations (
  idempotency_key_hash text primary key,
  operation_id uuid not null unique,
  request_fingerprint text not null,
  result jsonb null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint v3_anonymous_integrity_response_key_hash_check check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  constraint v3_anonymous_integrity_response_fingerprint_check check (request_fingerprint ~ '^[0-9a-f]{64}$')
);
revoke all on table private.v3_anonymous_integrity_response_operations from public, anon, authenticated;
grant all on table private.v3_anonymous_integrity_response_operations to service_role;

create or replace function public.v3_reporter_reply_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_id uuid,
  p_body text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_message text := btrim(coalesce(p_body, ''));
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity and expected case version are required' using errcode = '22023';
  end if;

  v_scope := jsonb_build_object('caseId', p_case_id);
  v_request := jsonb_build_object('body', v_message, 'expectedVersion', p_expected_version);
  v_fingerprint := private.studio2_request_fingerprint('integrity.case.reporter_reply', 'R3', v_scope, v_request);

  insert into public.studio2_operation_receipts(
    operation_id, actor_id, idempotency_key, correlation_id,
    request_fingerprint, command, risk_class, scope
  ) values (
    p_operation_id, v_actor, v_key, p_operation_id,
    v_fingerprint, 'integrity.case.reporter_reply', 'R3', v_scope
  ) on conflict do nothing;

  select receipt.* into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (receipt.actor_id = v_actor and receipt.command = 'integrity.case.reporter_reply' and receipt.idempotency_key = v_key)
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'integrity.case.reporter_reply'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object('ok', true, 'operation_id', v_receipt.operation_id, 'replayed', true);
  end if;
  if v_receipt.status <> 'processing' then raise exception 'STATE_CHANGED' using errcode = 'P0001'; end if;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null or v_case.reporter_user_id is distinct from v_actor then
    raise exception 'Case not available' using errcode = '42501';
  end if;
  if v_case.version <> p_expected_version then
    raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001';
  end if;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reporter_reply', true);
  v_result := public.reporter_reply_integrity_case_impl(p_case_id, v_message);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object(
    'ok', true,
    'snapshot', v_result,
    'case_id', p_case_id,
    'status', v_case.status,
    'version', v_case.version,
    'operation_id', p_operation_id,
    'receipt_id', p_operation_id
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$body$;

revoke all on function public.v3_reporter_reply_integrity_case(uuid, text, uuid, text, bigint) from public, anon;
grant execute on function public.v3_reporter_reply_integrity_case(uuid, text, uuid, text, bigint) to authenticated, service_role;

create or replace function public.v3_public_reply_anonymous_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_code text,
  p_recovery_key text,
  p_body text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_key_hash text;
  v_fingerprint text;
  v_row private.v3_anonymous_integrity_response_operations%rowtype;
  v_case_id uuid;
  v_case public.integrity_cases%rowtype;
  v_hash text;
  v_inner jsonb;
  v_result jsonb;
begin
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity and expected case version are required' using errcode = '22023';
  end if;

  v_key_hash := encode(extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'), 'hex');
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.reporter_reply.anonymous', 'R3',
    jsonb_build_object('caseCode', upper(btrim(coalesce(p_case_code, '')))),
    jsonb_build_object('body', btrim(coalesce(p_body, '')), 'expectedVersion', p_expected_version)
  );

  insert into private.v3_anonymous_integrity_response_operations(idempotency_key_hash, operation_id, request_fingerprint)
  values (v_key_hash, p_operation_id, v_fingerprint)
  on conflict do nothing;

  select * into v_row
  from private.v3_anonymous_integrity_response_operations
  where idempotency_key_hash = v_key_hash
  for update;

  if v_row.operation_id is distinct from p_operation_id or v_row.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_row.completed_at is not null then
    return coalesce(v_row.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(p_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.* into v_case
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(btrim(coalesce(p_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1
  for update of c;
  if v_case.id is null then raise exception 'Case code or recovery key is incorrect' using errcode = '42501'; end if;
  if v_case.version <> p_expected_version then
    raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001';
  end if;
  v_case_id := v_case.id;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reporter_reply.anonymous', true);
  v_inner := public.public_reply_anonymous_integrity_case_impl(p_case_code, p_recovery_key, p_body);

  select * into v_case from public.integrity_cases where id = v_case_id;
  v_result := jsonb_build_object(
    'ok', true,
    'result', v_inner,
    'case_id', v_case_id,
    'status', v_case.status,
    'version', v_case.version,
    'operation_id', p_operation_id,
    'replayed', false
  );
  update private.v3_anonymous_integrity_response_operations
  set result = v_result, completed_at = now()
  where idempotency_key_hash = v_key_hash;
  return v_result;
end
$body$;

revoke all on function public.v3_public_reply_anonymous_integrity_case(uuid, text, text, text, text, bigint) from public;
grant execute on function public.v3_public_reply_anonymous_integrity_case(uuid, text, text, text, text, bigint) to anon, authenticated, service_role;

-- Existing participant callers remain functional while the front-end cutover
-- lands. These shims deliberately lose stable retry identity and therefore are
-- documented compatibility only, never a second canonical implementation.
create or replace function public.reporter_reply_integrity_case(_case_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Case not available' using errcode = '42501'; end if;
  return public.v3_reporter_reply_integrity_case(
    v_operation,
    encode(extensions.digest(convert_to('integrity-reporter-reply-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    _case_id, _body, v_version
  );
end $compat$;

create or replace function public.public_reply_anonymous_integrity_case(_case_code text, _recovery_key text, _body text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private, extensions
as $compat$
declare v_operation uuid := extensions.gen_random_uuid(); v_version bigint;
begin
  select c.version into v_version
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(btrim(coalesce(_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = encode(extensions.digest(convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'), 'sha256'), 'hex')
  limit 1;
  if v_version is null then return jsonb_build_object('ok', false, 'error', 'Case code or recovery key is incorrect.'); end if;
  return public.v3_public_reply_anonymous_integrity_case(
    v_operation,
    encode(extensions.digest(convert_to('integrity-anonymous-reply-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    _case_code, _recovery_key, _body, v_version
  );
end $compat$;

revoke all on function public.reporter_reply_integrity_case(uuid, text) from public, anon;
grant execute on function public.reporter_reply_integrity_case(uuid, text) to authenticated, service_role;
revoke all on function public.public_reply_anonymous_integrity_case(text, text, text) from public;
grant execute on function public.public_reply_anonymous_integrity_case(text, text, text) to anon, authenticated, service_role;

comment on function public.reporter_reply_integrity_case(uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: participant case reply uses v3_reporter_reply_integrity_case with stable operation/idempotency identity and expected revision.';
comment on function public.public_reply_anonymous_integrity_case(text, text, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Sunset: anonymous case reply uses v3_public_reply_anonymous_integrity_case with stable operation/idempotency identity and expected revision.';
comment on function public.reporter_reply_integrity_case_impl(uuid, text) is
  'Sanctioned internal implementation primitive. Not API-executable; canonical entrypoint is v3_reporter_reply_integrity_case.';
comment on function public.public_reply_anonymous_integrity_case_impl(text, text, text) is
  'Sanctioned internal implementation primitive. Not API-executable; canonical entrypoint is v3_public_reply_anonymous_integrity_case.';

notify pgrst, 'reload schema';
commit;
