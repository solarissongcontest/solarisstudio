begin;

-- System V3 / O4: bind governed Confirmation round preview/apply commands to
-- the Organizer's exact expected edition. Existing RPCs remain available for
-- rollout compatibility; V2 callers gain an explicit cross-edition authority
-- boundary and force edition identity into the existing idempotency scope.
--
-- S13 contract: additive forward fix only. No destructive DDL and no backfill.
select public.v3_register_migration_contract(
  '20261019210500_v3_confirmation_round_edition_binding',
  1,
  'forward_fix_only',
  false,
  null,
  'Exact Organizer edition binding for governed Confirmation round commands'
);

create or replace function public.studio2_confirmation_round_change_preview_v2(
  p_edition_id uuid,
  p_round_id uuid,
  p_change_kind text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $preview_v2$
declare
  v_actor uuid := auth.uid();
  v_round_edition_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_edition_id uuid;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_change_kind not in ('create', 'update', 'status', 'editing', 'delete')
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_payload ? 'editionId' and nullif(v_payload ->> 'editionId', '') is not null then
    begin
      v_payload_edition_id := (v_payload ->> 'editionId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    if v_payload_edition_id is distinct from p_edition_id then
      raise exception using errcode = '22023', message = 'EDITION_SCOPE_MISMATCH';
    end if;
  end if;

  if p_change_kind = 'create' then
    if p_round_id is not null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  else
    if p_round_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select round.edition_id
    into v_round_edition_id
    from public.submission_rounds round
    where round.id = p_round_id;

    if v_round_edition_id is null then
      raise exception using errcode = 'P0002', message = 'ROUND_NOT_FOUND';
    end if;
    if v_round_edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'EDITION_SCOPE_MISMATCH';
    end if;
  end if;

  -- Force the explicit expected edition into the payload handed to the existing
  -- authority. For create this is already canonical input; for existing rounds
  -- it additionally becomes part of the old operation scope/fingerprint.
  v_payload := v_payload || jsonb_build_object('editionId', p_edition_id);

  v_result := public.studio2_confirmation_round_change_preview(
    p_round_id,
    p_change_kind,
    v_payload
  );

  if nullif(v_result ->> 'editionId', '')::uuid is distinct from p_edition_id then
    raise exception using errcode = 'P0001', message = 'EDITION_SCOPE_MISMATCH';
  end if;

  return v_result || jsonb_build_object('expectedEditionId', p_edition_id);
end
$preview_v2$;

revoke all on function public.studio2_confirmation_round_change_preview_v2(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.studio2_confirmation_round_change_preview_v2(uuid, uuid, text, jsonb)
  to authenticated;

create or replace function public.studio2_apply_confirmation_round_change_v2(
  p_edition_id uuid,
  p_round_id uuid,
  p_change_kind text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $apply_v2$
declare
  v_actor uuid := auth.uid();
  v_round_edition_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload_edition_id uuid;
  v_existing_receipt public.studio2_operation_receipts%rowtype;
  v_receipt_round_id uuid;
  v_receipt_edition_id uuid;
  v_receipt_expected_version bigint;
  v_result jsonb;
  v_expected_command text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 0
     or p_change_kind not in ('create', 'update', 'status', 'editing', 'delete')
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_expected_command := 'confirmation.round.' || p_change_kind;

  -- Reconcile the exact caller operation before object lookup. This matters for
  -- successful delete retries because the round correctly no longer exists.
  select receipt.*
  into v_existing_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor;

  if v_existing_receipt.operation_id is not null then
    begin
      v_receipt_round_id := nullif(v_existing_receipt.scope ->> 'roundId', '')::uuid;
      v_receipt_edition_id := nullif(v_existing_receipt.scope ->> 'editionId', '')::uuid;
      v_receipt_expected_version := nullif(v_existing_receipt.scope ->> 'expectedVersion', '')::bigint;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'DATABASE';
    end;

    if v_existing_receipt.command is distinct from v_expected_command
       or v_existing_receipt.idempotency_key is distinct from p_idempotency_key
       or v_receipt_round_id is distinct from p_round_id
       or v_receipt_edition_id is distinct from p_edition_id
       or v_receipt_expected_version is distinct from p_expected_version then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;

    if v_existing_receipt.status = 'succeeded' then
      return coalesce(v_existing_receipt.result, '{}'::jsonb)
        || jsonb_build_object(
          'editionId', p_edition_id,
          'expectedEditionId', p_edition_id,
          'operationId', v_existing_receipt.operation_id,
          'receiptId', v_existing_receipt.operation_id,
          'replayed', true
        );
    end if;

    return jsonb_strip_nulls(jsonb_build_object(
      'ok', false,
      'editionId', p_edition_id,
      'expectedEditionId', p_edition_id,
      'operationId', v_existing_receipt.operation_id,
      'receiptId', v_existing_receipt.operation_id,
      'status', v_existing_receipt.status,
      'error', case
        when v_existing_receipt.error_code is null then null
        else jsonb_build_object(
          'code', v_existing_receipt.error_code,
          'metadata', coalesce(v_existing_receipt.error_metadata, '{}'::jsonb)
        )
      end,
      'replayed', true
    ));
  end if;

  if not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_payload ? 'editionId' and nullif(v_payload ->> 'editionId', '') is not null then
    begin
      v_payload_edition_id := (v_payload ->> 'editionId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;
    if v_payload_edition_id is distinct from p_edition_id then
      raise exception using errcode = '22023', message = 'EDITION_SCOPE_MISMATCH';
    end if;
  end if;

  if p_change_kind = 'create' then
    if p_round_id is not null or p_expected_version <> 0 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
  else
    if p_round_id is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select round.edition_id
    into v_round_edition_id
    from public.submission_rounds round
    where round.id = p_round_id;

    if v_round_edition_id is null then
      raise exception using errcode = 'P0002', message = 'ROUND_NOT_FOUND';
    end if;
    if v_round_edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'EDITION_SCOPE_MISMATCH';
    end if;
  end if;

  v_payload := v_payload || jsonb_build_object('editionId', p_edition_id);

  v_result := public.studio2_apply_confirmation_round_change(
    p_round_id,
    p_change_kind,
    v_payload,
    p_operation_id,
    p_idempotency_key,
    p_expected_version
  );

  if v_result is null or jsonb_typeof(v_result) <> 'object' then
    raise exception using errcode = 'P0001', message = 'DATABASE';
  end if;
  if nullif(v_result ->> 'operationId', '')::uuid is distinct from p_operation_id then
    raise exception using errcode = 'P0001', message = 'OPERATION_ID_MISMATCH';
  end if;

  return v_result || jsonb_build_object(
    'editionId', p_edition_id,
    'expectedEditionId', p_edition_id,
    'receiptId', p_operation_id,
    'replayed', false
  );
end
$apply_v2$;

revoke all on function public.studio2_apply_confirmation_round_change_v2(
  uuid, uuid, text, jsonb, uuid, text, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.studio2_apply_confirmation_round_change_v2(
  uuid, uuid, text, jsonb, uuid, text, bigint
) to authenticated;

notify pgrst, 'reload schema';

commit;
