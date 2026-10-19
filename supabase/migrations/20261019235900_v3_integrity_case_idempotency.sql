begin;

-- V3 release blocker #994: participant Integrity case creation must be safe
-- across duplicate taps, network timeouts and lost responses. Protected cases
-- use the canonical authenticated operation receipt. Anonymous cases cannot use
-- an actor-owned receipt, so they receive a private replay ledger whose lookup
-- key is hashed and whose recovery credential is encrypted with key material
-- derived from the client-held idempotency secret. Neither secret is stored in
-- plaintext.

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
  'Private exact-once/replay ledger for anonymous Integrity case creation. Stores only a SHA-256 idempotency-key hash and an encrypted recovery credential; the raw client idempotency secret is never persisted.';

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
  v_case_id uuid;
  v_code text;
  v_secret_raw text;
  v_secret_pretty text;
  v_secret_hash text;
  v_recovery_secret text;
  v_priority text := 'standard';
  v_attempt integer := 0;
  v_created_at timestamptz := now();
  v_result jsonb;
begin
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  p_category := lower(btrim(coalesce(p_category, '')));
  p_case_kind := lower(btrim(coalesce(p_case_kind, 'report')));
  p_summary := btrim(coalesce(p_summary, ''));
  p_details := btrim(coalesce(p_details, ''));
  p_observed_facts := nullif(btrim(coalesce(p_observed_facts, '')), '');
  p_uncertainties := nullif(btrim(coalesce(p_uncertainties, '')), '');
  p_edition_reference := nullif(btrim(coalesce(p_edition_reference, '')), '');
  p_related_countries := coalesce(p_related_countries, '{}');

  if p_category not in (
    'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
    'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if char_length(p_summary) < 5 or char_length(p_summary) > 180
     or char_length(p_details) < 20 or char_length(p_details) > 12000
     or char_length(coalesce(p_observed_facts, '')) > 8000
     or char_length(coalesce(p_uncertainties, '')) > 6000
     or char_length(coalesce(p_edition_reference, '')) > 80
     or coalesce(array_length(p_related_countries, 1), 0) > 12 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_category = 'safety' or p_case_kind = 'safety' then
    v_priority := 'urgent';
  elsif p_category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then
    v_priority := 'high';
  elsif p_case_kind = 'rule_question' then
    v_priority := 'information';
  end if;

  v_key_hash := encode(
    extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'),
    'hex'
  );
  v_replay_cipher_key := encode(
    extensions.digest(convert_to('integrity-case-replay:v1:' || v_key, 'UTF8'), 'sha256'),
    'hex'
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.create.anonymous',
    'R2',
    jsonb_build_object('identityMode', 'anonymous'),
    jsonb_build_object(
      'caseKind', p_case_kind,
      'category', p_category,
      'summary', p_summary,
      'details', p_details,
      'observedFacts', p_observed_facts,
      'uncertainties', p_uncertainties,
      'relatedCountries', to_jsonb(p_related_countries),
      'editionReference', p_edition_reference
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
      hint = 'Retry the original report with its original operation identity, or start a new submission identity after editing.';
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

  loop
    v_attempt := v_attempt + 1;
    v_code := 'AR-' || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (
      select 1 from public.integrity_cases integrity_case where integrity_case.public_code = v_code
    );
    if v_attempt > 8 then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end if;
  end loop;

  v_secret_raw := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  v_secret_pretty := regexp_replace(v_secret_raw, '(.{4})(?=.)', '\1-', 'g');
  v_secret_hash := encode(
    extensions.digest(convert_to(v_secret_raw, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.integrity_cases (
    public_code,
    case_kind,
    category,
    identity_mode,
    reporter_user_id,
    summary,
    details,
    observed_facts,
    uncertainties,
    related_countries,
    edition_reference,
    status,
    priority
  ) values (
    v_code,
    p_case_kind,
    p_category,
    'anonymous',
    null,
    p_summary,
    p_details,
    p_observed_facts,
    p_uncertainties,
    p_related_countries,
    p_edition_reference,
    'received',
    v_priority
  )
  returning id into v_case_id;

  insert into public.integrity_case_access (case_id, recovery_secret_hash)
  values (v_case_id, v_secret_hash);

  insert into public.integrity_case_messages (case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', p_details, null);

  insert into public.integrity_case_events (case_id, event_type, detail, actor_user_id)
  values (v_case_id, 'case.created', 'Anonymous case received', null);

  v_result := jsonb_build_object(
    'case_id', v_case_id,
    'case_code', v_code,
    'status', 'received',
    'priority', v_priority,
    'created_at', v_created_at
  );

  update private.v3_anonymous_integrity_case_operations
  set
    case_id = v_case_id,
    recovery_secret_ciphertext = extensions.pgp_sym_encrypt(
      v_secret_pretty,
      v_replay_cipher_key,
      'cipher-algo=aes256'
    ),
    result = v_result,
    completed_at = now(),
    updated_at = now()
  where idempotency_key_hash = v_key_hash;

  return v_result || jsonb_build_object(
    'ok', true,
    'operation_id', p_operation_id,
    'recovery_key', v_secret_pretty,
    'replayed', false
  );
end
$create_anonymous$;

revoke all on function public.v3_public_create_anonymous_integrity_case(
  uuid, text, text, text, text, text, text, text[], text, text
) from public, anon, authenticated;
grant execute on function public.v3_public_create_anonymous_integrity_case(
  uuid, text, text, text, text, text, text[], text, text
) to anon, authenticated, service_role;

comment on function public.v3_public_create_anonymous_integrity_case(
  uuid, text, text, text, text, text, text[], text, text
) is
  'Idempotent anonymous Integrity case creation. Same secret operation identity + same semantic payload returns the same case and recovery key; conflicting reuse fails closed.';

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
set search_path = pg_catalog, public, private, extensions
as $create_protected$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_scope jsonb;
  v_semantic_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_canonical_operation_id uuid;
  v_case_id uuid;
  v_code text;
  v_priority text := 'standard';
  v_attempt integer := 0;
  v_created_at timestamptz := now();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_operation_id is null or v_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  p_identity_mode := lower(btrim(coalesce(p_identity_mode, '')));
  p_case_kind := lower(btrim(coalesce(p_case_kind, 'report')));
  p_category := lower(btrim(coalesce(p_category, 'other')));
  p_summary := btrim(coalesce(p_summary, ''));
  p_details := btrim(coalesce(p_details, ''));
  p_observed_facts := nullif(btrim(coalesce(p_observed_facts, '')), '');
  p_uncertainties := nullif(btrim(coalesce(p_uncertainties, '')), '');
  p_edition_reference := nullif(btrim(coalesce(p_edition_reference, '')), '');
  p_related_countries := coalesce(p_related_countries, '{}');

  if p_identity_mode not in ('sealed', 'confidential')
     or p_case_kind not in ('report', 'self_report', 'rule_question', 'vulnerability', 'safety')
     or p_category not in (
       'voting_integrity', 'vote_coordination', 'entry_eligibility', 'account_abuse',
       'conduct', 'safety', 'privacy', 'technical_exploit', 'tsbc_conduct', 'other'
     )
     or char_length(p_summary) < 5 or char_length(p_summary) > 180
     or char_length(p_details) < 20 or char_length(p_details) > 12000
     or char_length(coalesce(p_observed_facts, '')) > 8000
     or char_length(coalesce(p_uncertainties, '')) > 6000
     or char_length(coalesce(p_edition_reference, '')) > 80
     or coalesce(array_length(p_related_countries, 1), 0) > 12 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if p_category = 'safety' or p_case_kind = 'safety' then
    v_priority := 'urgent';
  elsif p_category in ('voting_integrity', 'vote_coordination', 'technical_exploit', 'privacy') then
    v_priority := 'high';
  elsif p_case_kind = 'rule_question' then
    v_priority := 'information';
  end if;

  v_scope := jsonb_build_object('identityMode', p_identity_mode);
  v_semantic_request := jsonb_build_object(
    'caseKind', p_case_kind,
    'category', p_category,
    'summary', p_summary,
    'details', p_details,
    'observedFacts', p_observed_facts,
    'uncertainties', p_uncertainties,
    'relatedCountries', to_jsonb(p_related_countries),
    'editionReference', p_edition_reference
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.create.protected',
    'R2',
    v_scope,
    v_semantic_request
  );

  -- Integrity intake is a reporting/security surface rather than an Organizer
  -- control mutation. Preserve its existing availability semantics while still
  -- using the canonical V3 receipt schema and exact-once identity.
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
      hint = 'Retry the original report with its original operation identity, or start a new submission identity after editing.';
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

  loop
    v_attempt := v_attempt + 1;
    v_code := case when p_identity_mode = 'sealed' then 'SR-' else 'CR-' end
      || upper(encode(extensions.gen_random_bytes(5), 'hex'));
    exit when not exists (
      select 1 from public.integrity_cases integrity_case where integrity_case.public_code = v_code
    );
    if v_attempt > 8 then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end if;
  end loop;

  insert into public.integrity_cases (
    public_code,
    case_kind,
    category,
    identity_mode,
    reporter_user_id,
    summary,
    details,
    observed_facts,
    uncertainties,
    related_countries,
    edition_reference,
    status,
    priority
  ) values (
    v_code,
    p_case_kind,
    p_category,
    p_identity_mode,
    v_actor,
    p_summary,
    p_details,
    p_observed_facts,
    p_uncertainties,
    p_related_countries,
    p_edition_reference,
    'received',
    v_priority
  )
  returning id into v_case_id;

  insert into public.integrity_case_messages (case_id, author_role, body, created_by)
  values (v_case_id, 'reporter', p_details, v_actor);

  insert into public.integrity_case_events (case_id, event_type, detail, actor_user_id)
  values (
    v_case_id,
    'case.created',
    case
      when p_identity_mode = 'sealed' then 'Sealed-identity case received'
      else 'Confidential case received'
    end,
    v_actor
  );

  v_result := jsonb_build_object(
    'case_id', v_case_id,
    'case_code', v_code,
    'status', 'received',
    'priority', v_priority,
    'created_at', v_created_at
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
  'Idempotent protected Integrity case creation backed by the canonical V3 operation receipt. Actor identity always comes from auth.uid().';

notify pgrst, 'reload schema';

commit;
