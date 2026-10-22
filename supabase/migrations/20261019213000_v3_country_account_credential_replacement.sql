begin;

select public.v3_register_migration_contract(
  'v3.o14.country-account-credential-replacement',
  1,
  'forward_fix_only',
  false,
  null,
  'Fresh-authenticated, exact-target, idempotent and receipted Organizer country-account credential replacement'
);

-- The actual password remains exclusively inside the trusted Edge Function and
-- Supabase Auth admin API. This database boundary receives only a keyed,
-- one-way credential fingerprint produced by that server function. S2 then
-- persists only its normal semantic request fingerprint, never the credential
-- fingerprint itself.
create or replace function public.studio2_begin_country_account_credential_replace(
  p_target_user_id uuid,
  p_country_id uuid,
  p_expected_updated_at timestamptz,
  p_credential_fingerprint text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $begin_replace$
declare
  v_actor uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_fingerprint text := lower(nullif(btrim(coalesce(p_credential_fingerprint, '')), ''));
  v_reason constant text := 'Organizer country-account credential replacement';
  v_session_policy constant text := 'preserve_existing_sessions';
  v_scope jsonb;
  v_semantic_request jsonb;
  v_request_fingerprint text;
  v_existing public.studio2_operation_receipts;
  v_account public.country_accounts;
  v_country_name text;
  v_claim jsonb;
  v_freshness jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_target_user_id is null
     or p_country_id is null
     or p_expected_updated_at is null
     or p_operation_id is null
     or v_key is null
     or v_fingerprint is null
     or v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_scope := jsonb_build_object(
    'subjectType', 'country_account',
    'subjectId', p_target_user_id,
    'targetUserId', p_target_user_id,
    'countryId', p_country_id,
    'expectedUpdatedAt', p_expected_updated_at,
    'reason', v_reason,
    'sessionPolicy', v_session_policy
  );
  v_semantic_request := jsonb_build_object(
    'credentialFingerprint', v_fingerprint
  );
  v_request_fingerprint := private.studio2_request_fingerprint(
    'country_account.credential_replace',
    'R3',
    v_scope,
    v_semantic_request
  );

  -- A lost response after success is reconciliation, not a new high-risk
  -- mutation. Mirror the canonical R3 permission wrapper: allow the exact
  -- already-succeeded semantic operation to return without demanding another
  -- fresh-authentication ceremony.
  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.actor_id = v_actor
    and receipt.command = 'country_account.credential_replace'
    and (
      receipt.operation_id = p_operation_id
      or receipt.idempotency_key = v_key
    )
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1;

  if v_existing.operation_id is not null then
    if v_existing.operation_id is distinct from p_operation_id
       or v_existing.idempotency_key is distinct from v_key
       or v_existing.request_fingerprint is distinct from v_request_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_CONFLICT',
        hint = 'Reuse the exact reviewed credential replacement request or create a new operation.';
    end if;

    if v_existing.status = 'succeeded' then
      return jsonb_build_object(
        'replayed', true,
        'operationId', v_existing.operation_id,
        'status', v_existing.status,
        'result', v_existing.result,
        'sessionPolicy', v_session_policy
      );
    end if;
    if v_existing.status = 'failed' then
      return jsonb_build_object(
        'replayed', true,
        'operationId', v_existing.operation_id,
        'status', v_existing.status,
        'error', jsonb_build_object(
          'code', v_existing.error_code,
          'metadata', coalesce(v_existing.error_metadata, '{}'::jsonb)
        ),
        'sessionPolicy', v_session_policy
      );
    end if;
  end if;

  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_freshness := private.studio2_require_fresh_auth(300);

  select account.*
  into v_account
  from public.country_accounts account
  where account.user_id = p_target_user_id
    and account.country_id = p_country_id
  for update;

  if v_account.user_id is null then
    raise exception using errcode = 'P0002', message = 'COUNTRY_ACCOUNT_NOT_FOUND';
  end if;
  if v_account.updated_at is distinct from p_expected_updated_at then
    raise sqlstate 'PT409' using
      message = 'VERSION_CONFLICT',
      hint = 'Reload the country account and review the credential replacement again.';
  end if;

  select country.name
  into v_country_name
  from public.countries country
  where country.id = p_country_id;

  if v_country_name is null then
    raise exception using errcode = 'P0002', message = 'COUNTRY_NOT_FOUND';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    coalesce(p_correlation_id, p_operation_id),
    'country_account.credential_replace',
    'R3',
    v_scope,
    v_semantic_request
  );

  update public.studio2_operation_receipts receipt
  set
    actor_session_id = v_freshness ->> 'sessionId',
    auth_freshness_evidence = v_freshness,
    updated_at = now()
  where receipt.operation_id = (v_claim ->> 'operationId')::uuid
    and receipt.actor_id = v_actor
    and receipt.status = 'processing';

  return jsonb_build_object(
    'replayed', coalesce((v_claim ->> 'replayed')::boolean, false),
    'operationId', (v_claim ->> 'operationId')::uuid,
    'status', coalesce(v_claim ->> 'status', 'processing'),
    'target', jsonb_build_object(
      'userId', v_account.user_id,
      'countryId', v_account.country_id,
      'countryName', v_country_name,
      'accountStatus', v_account.status,
      'updatedAt', v_account.updated_at
    ),
    'sessionPolicy', v_session_policy,
    'serverTime', now()
  );
end
$begin_replace$;

revoke all on function public.studio2_begin_country_account_credential_replace(
  uuid, uuid, timestamptz, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_begin_country_account_credential_replace(
  uuid, uuid, timestamptz, text, uuid, text, uuid
) to authenticated;

-- Finalization is service-role only because it attests that the trusted Edge
-- Function has actually invoked the Auth admin API. A browser must never be
-- able to manufacture a successful credential-replacement receipt.
create or replace function public.studio2_finalize_country_account_credential_replace(
  p_actor_id uuid,
  p_operation_id uuid,
  p_outcome text,
  p_failure_stage text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $finalize_replace$
declare
  v_outcome text := lower(nullif(btrim(coalesce(p_outcome, '')), ''));
  v_failure_stage text := lower(nullif(btrim(coalesce(p_failure_stage, '')), ''));
  v_receipt public.studio2_operation_receipts;
  v_target_user_id uuid;
  v_country_id uuid;
  v_reason text;
  v_session_policy text;
  v_result jsonb;
  v_error_code text;
begin
  if p_actor_id is null or p_operation_id is null
     or v_outcome not in ('succeeded', 'failed') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_failure_stage is not null
     and v_failure_stage not in ('password_policy', 'password_safety_dependency', 'auth_update') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = p_actor_id
    and receipt.command = 'country_account.credential_replace'
  for update;

  if v_receipt.operation_id is null then
    raise exception using errcode = 'P0002', message = 'UNKNOWN';
  end if;

  if v_receipt.status = 'succeeded' then
    return jsonb_build_object(
      'operationId', v_receipt.operation_id,
      'status', v_receipt.status,
      'result', v_receipt.result,
      'replayed', true
    );
  end if;
  if v_receipt.status = 'failed' then
    return jsonb_build_object(
      'operationId', v_receipt.operation_id,
      'status', v_receipt.status,
      'error', jsonb_build_object(
        'code', v_receipt.error_code,
        'metadata', coalesce(v_receipt.error_metadata, '{}'::jsonb)
      ),
      'replayed', true
    );
  end if;
  if v_receipt.status <> 'processing' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  v_target_user_id := nullif(v_receipt.scope ->> 'targetUserId', '')::uuid;
  v_country_id := nullif(v_receipt.scope ->> 'countryId', '')::uuid;
  v_reason := nullif(v_receipt.scope ->> 'reason', '');
  v_session_policy := nullif(v_receipt.scope ->> 'sessionPolicy', '');

  if v_target_user_id is null or v_country_id is null
     or v_reason is null
     or v_session_policy <> 'preserve_existing_sessions' then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  if v_outcome = 'failed' then
    v_error_code := case
      when v_failure_stage = 'password_policy' then 'VALIDATION'
      when v_failure_stage in ('password_safety_dependency', 'auth_update') then 'DEPENDENCY_FAILURE'
      else 'UNKNOWN'
    end;

    update public.studio2_operation_receipts
    set
      status = 'failed',
      result = null,
      error_code = v_error_code,
      error_metadata = jsonb_build_object(
        'stage', coalesce(v_failure_stage, 'unknown'),
        'targetUserId', v_target_user_id,
        'countryId', v_country_id
      ),
      completed_at = now(),
      updated_at = now()
    where operation_id = p_operation_id;

    insert into public.admin_audit_log (
      actor_id,
      action,
      table_name,
      record_id,
      before_data,
      after_data
    ) values (
      p_actor_id,
      'country_account_credential_replace_failed',
      'country_accounts',
      v_target_user_id::text,
      jsonb_build_object(
        'operationId', p_operation_id,
        'targetUserId', v_target_user_id,
        'countryId', v_country_id,
        'reason', v_reason,
        'sessionPolicy', v_session_policy
      ),
      jsonb_build_object(
        'outcome', 'failed',
        'failureStage', coalesce(v_failure_stage, 'unknown'),
        'passwordPersisted', false
      )
    );

    return jsonb_build_object(
      'operationId', p_operation_id,
      'status', 'failed',
      'error', jsonb_build_object(
        'code', v_error_code,
        'metadata', jsonb_build_object('stage', coalesce(v_failure_stage, 'unknown'))
      )
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'userId', v_target_user_id,
    'countryId', v_country_id,
    'sessionPolicy', v_session_policy,
    'sessionsRevoked', false,
    'serverTime', now()
  );

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    p_actor_id,
    'country_account_credential_replaced',
    'country_accounts',
    v_target_user_id::text,
    jsonb_build_object(
      'operationId', p_operation_id,
      'targetUserId', v_target_user_id,
      'countryId', v_country_id,
      'reason', v_reason,
      'sessionPolicy', v_session_policy,
      'expectedUpdatedAt', v_receipt.scope ->> 'expectedUpdatedAt'
    ),
    jsonb_build_object(
      'outcome', 'succeeded',
      'credentialReplaced', true,
      'sessionsRevoked', false,
      'passwordPersisted', false
    )
  );

  update public.studio2_operation_receipts
  set
    status = 'succeeded',
    result = v_result,
    error_code = null,
    error_metadata = null,
    completed_at = now(),
    updated_at = now()
  where operation_id = p_operation_id;

  return jsonb_build_object(
    'operationId', p_operation_id,
    'status', 'succeeded',
    'result', v_result,
    'replayed', false
  );
end
$finalize_replace$;

revoke all on function public.studio2_finalize_country_account_credential_replace(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.studio2_finalize_country_account_credential_replace(
  uuid, uuid, text, text
) to service_role;

comment on function public.studio2_begin_country_account_credential_replace(
  uuid, uuid, timestamptz, text, uuid, text, uuid
) is
  'Begins the canonical R3 Organizer country-account credential replacement. The credential itself never crosses this database boundary.';
comment on function public.studio2_finalize_country_account_credential_replace(
  uuid, uuid, text, text
) is
  'Service-role attestation/finalization after the trusted Edge Function invokes Supabase Auth admin credential replacement.';

notify pgrst, 'reload schema';

commit;
