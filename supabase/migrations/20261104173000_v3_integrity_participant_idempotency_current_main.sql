begin;

-- Participant Integrity intake must be safe across duplicate taps, timeouts and
-- lost success responses. Reuse the established case-creation writers for
-- validation and canonical case/message/event creation; this migration adds
-- exact-once/replay authority around those mature primitives.
select public.v3_register_migration_contract(
  'v3.integrity.participant-case-idempotency',
  1,
  'forward_fix_only',
  false,
  null,
  'Participant Integrity intake gains semantic idempotency, private anonymous recovery replay and actor-bound protected receipts'
);

create table if not exists private.v3_anonymous_integrity_case_operations (
  idempotency_key_hash text primary key,
  operation_id uuid not null unique,
  request_fingerprint text not null,
  case_id uuid references public.integrity_cases(id) on delete cascade,
  recovery_secret_ciphertext bytea,
  result jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v3_anonymous_integrity_case_operations_key_hash_check
    check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  constraint v3_anonymous_integrity_case_operations_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint v3_anonymous_integrity_case_operations_completion_check
    check (
      (completed_at is null and case_id is null and recovery_secret_ciphertext is null and result is null)
      or
      (completed_at is not null and case_id is not null and recovery_secret_ciphertext is not null and result is not null)
    )
);

create index if not exists v3_anonymous_integrity_case_operations_case_idx
  on private.v3_anonymous_integrity_case_operations (case_id)
  where case_id is not null;

revoke all on table private.v3_anonymous_integrity_case_operations
  from public, anon, authenticated;
grant all on table private.v3_anonymous_integrity_case_operations to service_role;

comment on table private.v3_anonymous_integrity_case_operations is
  'Private replay ledger for anonymous Integrity case creation. The raw client idempotency secret and plaintext recovery credential are never persisted.';

create or replace function public.v3_public_create_anonymous_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_category text,
  p_summary text,
  p_details text,
  p_observed_facts text default null,
  p_uncertainties text default null,
  p_related_countries text[] default '{}',
  p_edition_reference text default null,
  p_case_kind text default 'report'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $create_anonymous$
declare
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_key_hash text;
  v_replay_cipher_key text;
  v_fingerprint text;
  v_operation private.v3_anonymous_integrity_case_operations%rowtype;
  v_base_result jsonb;
  v_result jsonb;
  v_case_id uuid;
  v_recovery_secret text;
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_case_kind text := lower(btrim(coalesce(p_case_kind, 'report')));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_observed_facts text := nullif(btrim(coalesce(p_observed_facts, '')), '');
  v_uncertainties text := nullif(btrim(coalesce(p_uncertainties, '')), '');
  v_edition_reference text := nullif(btrim(coalesce(p_edition_reference, '')), '');
  v_related_countries text[];
begin
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select coalesce(array_agg(country order by country), '{}'::text[])
  into v_related_countries
  from unnest(coalesce(p_related_countries, '{}'::text[])) country;

  v_key_hash := encode(
    extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'),
    'hex'
  );
  v_replay_cipher_key := encode(
    extensions.digest(
      convert_to('integrity-case-replay:v1:' || v_key, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.create.anonymous',
    'R2',
    jsonb_build_object('identityMode', 'anonymous'),
    jsonb_build_object(
      'caseKind', v_case_kind,
      'category', v_category,
      'summary', v_summary,
      'details', v_details,
      'observedFacts', v_observed_facts,
      'uncertainties', v_uncertainties,
      'relatedCountries', to_jsonb(v_related_countries),
      'editionReference', v_edition_reference
    )
  );

  insert into private.v3_anonymous_integrity_case_operations (
    idempotency_key_hash,
    operation_id,
    request_fingerprint
  ) values (
    v_key_hash,
    p_operation_id,
    v_fingerprint
  )
  on conflict do nothing;

  select operation_row.*
  into v_operation
  from private.v3_anonymous_integrity_case_operations operation_row
  where operation_row.idempotency_key_hash = v_key_hash
  for update;

  if v_operation.operation_id is null
     or v_operation.operation_id is distinct from p_operation_id
     or v_operation.request_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Retry the original report with its original submission identity, or create a new identity after editing.';
  end if;

  if v_operation.completed_at is not null then
    if v_operation.case_id is null
       or v_operation.result is null
       or v_operation.recovery_secret_ciphertext is null then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end if;

    begin
      v_recovery_secret := extensions.pgp_sym_decrypt(
        v_operation.recovery_secret_ciphertext,
        v_replay_cipher_key
      );
    exception when others then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end;

    return v_operation.result || jsonb_build_object(
      'ok', true,
      'operation_id', v_operation.operation_id,
      'recovery_key', v_recovery_secret,
      'replayed', true
    );
  end if;

  -- Mature primitive remains the validation/case-creation authority. Because it
  -- executes inside this transaction, a wrapper failure rolls back both case
  -- creation and replay-ledger state together.
  v_base_result := public.public_create_anonymous_integrity_case(
    v_category,
    v_summary,
    v_details,
    v_observed_facts,
    v_uncertainties,
    v_related_countries,
    v_edition_reference,
    v_case_kind
  );

  if coalesce((v_base_result ->> 'ok')::boolean, false) is not true
     or nullif(v_base_result ->> 'case_code', '') is null
     or nullif(v_base_result ->> 'recovery_key', '') is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  select integrity_case.id
  into v_case_id
  from public.integrity_cases integrity_case
  where integrity_case.public_code = v_base_result ->> 'case_code';

  if v_case_id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_recovery_secret := v_base_result ->> 'recovery_key';
  v_result := (v_base_result - 'recovery_key') || jsonb_build_object(
    'case_id', v_case_id,
    'operation_id', p_operation_id
  );

  update private.v3_anonymous_integrity_case_operations
  set
    case_id = v_case_id,
    recovery_secret_ciphertext = extensions.pgp_sym_encrypt(
      v_recovery_secret,
      v_replay_cipher_key,
      'cipher-algo=aes256'
    ),
    result = v_result,
    completed_at = now(),
    updated_at = now()
  where idempotency_key_hash = v_key_hash;

  return v_result || jsonb_build_object(
    'ok', true,
    'recovery_key', v_recovery_secret,
    'replayed', false
  );
end
$create_anonymous$;

revoke all on function public.v3_public_create_anonymous_integrity_case(
  uuid, text, text, text, text, text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.v3_public_create_anonymous_integrity_case(
  uuid, text, text, text, text, text, text, text[], text, text
) to anon, authenticated, service_role;

comment on function public.v3_public_create_anonymous_integrity_case(
  uuid, text, text, text, text, text, text, text[], text, text
) is
  'Retry-safe anonymous Integrity intake. Same secret submission identity and semantic payload replay the same case and encrypted recovery credential.';

create or replace function public.v3_create_protected_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_identity_mode text,
  p_case_kind text,
  p_category text,
  p_summary text,
  p_details text,
  p_observed_facts text default null,
  p_uncertainties text default null,
  p_related_countries text[] default '{}',
  p_edition_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, auth
as $create_protected$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_identity_mode text := lower(btrim(coalesce(p_identity_mode, '')));
  v_case_kind text := lower(btrim(coalesce(p_case_kind, 'report')));
  v_category text := lower(btrim(coalesce(p_category, 'other')));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_observed_facts text := nullif(btrim(coalesce(p_observed_facts, '')), '');
  v_uncertainties text := nullif(btrim(coalesce(p_uncertainties, '')), '');
  v_edition_reference text := nullif(btrim(coalesce(p_edition_reference, '')), '');
  v_related_countries text[];
  v_scope jsonb;
  v_semantic_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_canonical_operation_id uuid;
  v_base_result jsonb;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select coalesce(array_agg(country order by country), '{}'::text[])
  into v_related_countries
  from unnest(coalesce(p_related_countries, '{}'::text[])) country;

  v_scope := jsonb_build_object('identityMode', v_identity_mode);
  v_semantic_request := jsonb_build_object(
    'caseKind', v_case_kind,
    'category', v_category,
    'summary', v_summary,
    'details', v_details,
    'observedFacts', v_observed_facts,
    'uncertainties', v_uncertainties,
    'relatedCountries', to_jsonb(v_related_countries),
    'editionReference', v_edition_reference
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.create.protected',
    'R2',
    v_scope,
    v_semantic_request
  );

  -- Integrity intake is an end-user reporting/security surface, not an
  -- Organizer control mutation. Preserve that availability boundary while
  -- still using the canonical receipt schema and actor-bound exact-once key.
  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope
  ) values (
    p_operation_id,
    v_actor,
    v_key,
    p_operation_id,
    v_fingerprint,
    'integrity.case.create.protected',
    'R2',
    v_scope
  )
  on conflict do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (
       receipt.actor_id = v_actor
       and receipt.command = 'integrity.case.create.protected'
       and receipt.idempotency_key = v_key
     )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'integrity.case.create.protected'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception using
      errcode = 'P0001',
      message = 'IDEMPOTENCY_CONFLICT',
      hint = 'Retry the original report with its original submission identity, or create a new identity after editing.';
  end if;

  v_canonical_operation_id := v_receipt.operation_id;

  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object(
      'ok', true,
      'operation_id', v_canonical_operation_id,
      'receipt_id', v_canonical_operation_id,
      'replayed', true
    );
  end if;

  if v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  v_base_result := public.create_protected_integrity_case(
    v_identity_mode,
    v_case_kind,
    v_category,
    v_summary,
    v_details,
    v_observed_facts,
    v_uncertainties,
    v_related_countries,
    v_edition_reference
  );

  if coalesce((v_base_result ->> 'ok')::boolean, false) is not true
     or nullif(v_base_result ->> 'case_id', '') is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  select integrity_case.*
  into v_case
  from public.integrity_cases integrity_case
  where integrity_case.id = (v_base_result ->> 'case_id')::uuid
    and integrity_case.reporter_user_id = v_actor;

  if v_case.id is null then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;

  v_result := v_base_result || jsonb_build_object(
    'status', v_case.status,
    'priority', v_case.priority,
    'created_at', v_case.created_at
  );

  perform private.studio2_complete_operation(v_canonical_operation_id, v_result);

  return v_result || jsonb_build_object(
    'ok', true,
    'operation_id', v_canonical_operation_id,
    'receipt_id', v_canonical_operation_id,
    'replayed', false
  );
end
$create_protected$;

revoke all on function public.v3_create_protected_integrity_case(
  uuid, text, text, text, text, text, text, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.v3_create_protected_integrity_case(
  uuid, text, text, text, text, text, text, text, text, text[], text
) to authenticated, service_role;

comment on function public.v3_create_protected_integrity_case(
  uuid, text, text, text, text, text, text, text, text, text[], text
) is
  'Retry-safe protected Integrity intake. Actor identity comes only from auth.uid(); same semantic submission identity replays one canonical operation receipt.';

notify pgrst, 'reload schema';

commit;
