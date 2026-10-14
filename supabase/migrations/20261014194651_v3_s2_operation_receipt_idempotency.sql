begin;

-- System V3 S2: evolve the existing operation receipt into the canonical
-- cross-surface idempotency and reconciliation record. This is intentionally
-- additive: existing Organizer commands keep the five-argument claim helper,
-- while new commands can supply correlation and semantic request data.

alter table public.studio2_operation_receipts
  add column if not exists correlation_id uuid,
  add column if not exists request_fingerprint text,
  add column if not exists completed_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_metadata jsonb;

-- The production audit found no rows, but keep deployment safe if a command is
-- completed between audit and migration. Legacy receipts receive stable values
-- derived only from their already-persisted semantic fields.
update public.studio2_operation_receipts
set
  correlation_id = coalesce(correlation_id, operation_id),
  request_fingerprint = coalesce(
    request_fingerprint,
    encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'command', command,
            'riskClass', risk_class,
            'scope', coalesce(scope, '{}'::jsonb),
            'request', '{}'::jsonb
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  ),
  completed_at = case
    when status = 'succeeded' then coalesce(completed_at, updated_at)
    else completed_at
  end;

alter table public.studio2_operation_receipts
  alter column correlation_id set not null,
  alter column request_fingerprint set not null;

alter table public.studio2_operation_receipts
  add constraint studio2_operation_receipts_v3_status_check
    check (status in ('processing', 'succeeded', 'failed', 'uncertain')) not valid,
  add constraint studio2_operation_receipts_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$') not valid,
  add constraint studio2_operation_receipts_error_code_check
    check (
      error_code is null
      or error_code in (
        'AUTHENTICATION',
        'AUTHORIZATION',
        'VALIDATION',
        'STATE_CHANGED',
        'VERSION_CONFLICT',
        'IDEMPOTENCY_CONFLICT',
        'RATE_LIMIT',
        'DEPENDENCY_FAILURE',
        'DATABASE',
        'STORAGE',
        'TIMEOUT',
        'UNKNOWN'
      )
    ) not valid,
  add constraint studio2_operation_receipts_error_metadata_check
    check (
      error_metadata is null
      or (
        jsonb_typeof(error_metadata) = 'object'
        and pg_column_size(error_metadata) <= 8192
      )
    ) not valid,
  add constraint studio2_operation_receipts_completion_check
    check (
      (status = 'processing' and completed_at is null and error_code is null)
      or (status = 'succeeded' and completed_at is not null and error_code is null)
      or (status in ('failed', 'uncertain') and completed_at is not null and error_code is not null)
    ) not valid;

alter table public.studio2_operation_receipts
  validate constraint studio2_operation_receipts_v3_status_check;
alter table public.studio2_operation_receipts
  validate constraint studio2_operation_receipts_fingerprint_check;
alter table public.studio2_operation_receipts
  validate constraint studio2_operation_receipts_error_code_check;
alter table public.studio2_operation_receipts
  validate constraint studio2_operation_receipts_error_metadata_check;
alter table public.studio2_operation_receipts
  validate constraint studio2_operation_receipts_completion_check;

alter table public.studio2_operation_receipts
  drop constraint if exists studio2_operation_receipts_status_check;

create index if not exists studio2_operation_receipts_correlation_time_idx
  on public.studio2_operation_receipts (correlation_id, created_at desc);

create or replace function private.studio2_request_fingerprint(
  p_command text,
  p_risk_class text,
  p_scope jsonb,
  p_semantic_request jsonb
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, public, private, extensions
as $fingerprint$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'command', nullif(btrim(coalesce(p_command, '')), ''),
          'riskClass', p_risk_class,
          'scope', coalesce(p_scope, '{}'::jsonb),
          'request', coalesce(p_semantic_request, '{}'::jsonb)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$fingerprint$;

revoke all on function private.studio2_request_fingerprint(text, text, jsonb, jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_claim_operation(
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_command text,
  p_risk_class text,
  p_scope jsonb,
  p_semantic_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $claim$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_command text := nullif(btrim(coalesce(p_command, '')), '');
  v_correlation_id uuid := coalesce(p_correlation_id, p_operation_id);
  v_scope jsonb := coalesce(p_scope, '{}'::jsonb);
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_operation_id is null or v_key is null or v_command is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_risk_class not in ('R0', 'R1', 'R2', 'R3') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_scope) <> 'object'
     or jsonb_typeof(coalesce(p_semantic_request, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    p_risk_class,
    v_scope,
    p_semantic_request
  );

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = v_command
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is not null then
    if v_receipt.actor_id is distinct from v_actor
       or v_receipt.command is distinct from v_command
       or v_receipt.idempotency_key is distinct from v_key
       or v_receipt.request_fingerprint is distinct from v_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_CONFLICT',
        hint = 'Use the original semantic request or a new idempotency key.';
    end if;

    return jsonb_build_object(
      'replayed', true,
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
  end if;

  if not coalesce(private.studio2_platform_mutation_allowed(v_command), false) then
    raise exception using errcode = '25006', message = 'STATE_CHANGED';
  end if;

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope
  )
  values (
    p_operation_id,
    v_actor,
    v_key,
    v_correlation_id,
    v_fingerprint,
    v_command,
    p_risk_class,
    v_scope
  )
  on conflict do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = v_command
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  if v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from v_command
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Use the original semantic request or a new idempotency key.';
  end if;

  if v_receipt.operation_id is distinct from p_operation_id then
    return jsonb_build_object(
      'replayed', true,
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
  end if;

  return jsonb_build_object(
    'replayed', false,
    'operationId', v_receipt.operation_id,
    'correlationId', v_receipt.correlation_id,
    'status', v_receipt.status
  );
end
$claim$;

revoke all on function private.studio2_claim_operation(
  uuid, text, uuid, text, text, jsonb, jsonb
) from public, anon, authenticated;

-- Backward-compatible Organizer adapter. Existing callers gain correlation,
-- fingerprints, conflict detection and richer states without signature churn.
create or replace function private.studio2_claim_operation(
  p_operation_id uuid,
  p_idempotency_key text,
  p_command text,
  p_risk_class text,
  p_scope jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, extensions
as $legacy_claim$
  select private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    p_command,
    p_risk_class,
    coalesce(p_scope, '{}'::jsonb),
    '{}'::jsonb
  )
$legacy_claim$;

revoke all on function private.studio2_claim_operation(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_complete_operation(
  p_operation_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $complete$
declare
  v_actor uuid := auth.uid();
  v_receipt public.studio2_operation_receipts;
begin
  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb);
  end if;
  if v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  update public.studio2_operation_receipts
  set
    status = 'succeeded',
    result = coalesce(p_result, '{}'::jsonb),
    error_code = null,
    error_metadata = null,
    completed_at = now(),
    updated_at = now()
  where operation_id = p_operation_id;

  return coalesce(p_result, '{}'::jsonb);
end
$complete$;

revoke all on function private.studio2_complete_operation(uuid, jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_fail_operation(
  p_operation_id uuid,
  p_error_code text,
  p_error_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fail$
declare
  v_actor uuid := auth.uid();
  v_error_code text := upper(nullif(btrim(coalesce(p_error_code, '')), ''));
  v_metadata jsonb := coalesce(p_error_metadata, '{}'::jsonb);
  v_receipt public.studio2_operation_receipts;
begin
  if v_error_code is null or v_error_code not in (
    'AUTHENTICATION', 'AUTHORIZATION', 'VALIDATION', 'STATE_CHANGED',
    'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'RATE_LIMIT',
    'DEPENDENCY_FAILURE', 'DATABASE', 'STORAGE', 'TIMEOUT', 'UNKNOWN'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' or pg_column_size(v_metadata) > 8192 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;
  if v_receipt.status = 'succeeded' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;
  if v_receipt.status = 'failed' then
    return jsonb_build_object(
      'operationId', v_receipt.operation_id,
      'status', v_receipt.status,
      'error', jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      )
    );
  end if;

  update public.studio2_operation_receipts
  set
    status = 'failed',
    result = null,
    error_code = v_error_code,
    error_metadata = v_metadata,
    completed_at = now(),
    updated_at = now()
  where operation_id = p_operation_id;

  return jsonb_build_object(
    'operationId', p_operation_id,
    'status', 'failed',
    'error', jsonb_build_object('code', v_error_code, 'metadata', v_metadata)
  );
end
$fail$;

revoke all on function private.studio2_fail_operation(uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function private.studio2_mark_operation_uncertain(
  p_operation_id uuid,
  p_error_code text default 'UNKNOWN',
  p_error_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $uncertain$
declare
  v_actor uuid := auth.uid();
  v_error_code text := upper(nullif(btrim(coalesce(p_error_code, 'UNKNOWN')), ''));
  v_metadata jsonb := coalesce(p_error_metadata, '{}'::jsonb);
begin
  if v_error_code not in ('DEPENDENCY_FAILURE', 'DATABASE', 'STORAGE', 'TIMEOUT', 'UNKNOWN')
     or jsonb_typeof(v_metadata) <> 'object'
     or pg_column_size(v_metadata) > 8192 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  update public.studio2_operation_receipts
  set
    status = 'uncertain',
    result = null,
    error_code = v_error_code,
    error_metadata = v_metadata,
    completed_at = now(),
    updated_at = now()
  where operation_id = p_operation_id
    and actor_id = v_actor
    and status = 'processing';

  if not found then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  return jsonb_build_object(
    'operationId', p_operation_id,
    'status', 'uncertain',
    'error', jsonb_build_object('code', v_error_code, 'metadata', v_metadata)
  );
end
$uncertain$;

revoke all on function private.studio2_mark_operation_uncertain(uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function public.studio2_reconcile_operation(
  p_operation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_actor uuid := auth.uid();
  v_receipt public.studio2_operation_receipts;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  return jsonb_build_object(
    'operationId', v_receipt.operation_id,
    'correlationId', v_receipt.correlation_id,
    'command', v_receipt.command,
    'status', v_receipt.status,
    'result', v_receipt.result,
    'error', case
      when v_receipt.error_code is null then null
      else jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      )
    end,
    'createdAt', v_receipt.created_at,
    'updatedAt', v_receipt.updated_at,
    'completedAt', v_receipt.completed_at
  );
end
$reconcile$;

revoke all on function public.studio2_reconcile_operation(uuid)
  from public, anon;
grant execute on function public.studio2_reconcile_operation(uuid)
  to authenticated, service_role;

comment on function public.studio2_reconcile_operation(uuid) is
  'Returns the current actor''s safe canonical operation receipt for lost-response recovery.';

notify pgrst, 'reload schema';

commit;
