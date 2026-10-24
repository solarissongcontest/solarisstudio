begin;

-- System V3 / Organizer O6: retain the fresh-auth evidence used by permanent
-- Show deletion in the canonical protected S2 operation receipt. The original
-- Show lifecycle command already enforces the R3 boundary; this forward hardening
-- makes that proof durable and reviewable like other R3 command families.
select public.v3_register_migration_contract(
  'v3.o6.show-lifecycle-r3-receipt-evidence',
  1,
  'forward_fix_only',
  false,
  null,
  'Retain fresh-auth session evidence on governed permanent Show deletion receipts'
);

create or replace function public.studio2_delete_show_v3(
  p_edition_id uuid,
  p_show_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $delete_show$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_before public.shows;
  v_preflight jsonb;
  v_auth_evidence jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null
     or p_expected_version is null or p_expected_version < 1
     or v_reason is null or char_length(v_reason) < 4 or char_length(v_reason) > 500
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('edition.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Claim before mutable-state validation. A retry after a successful deletion
  -- can therefore replay the receipt even though the Show row no longer exists.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.delete',
    'R3',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'expectedVersion', p_expected_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- A genuinely new permanent deletion must prove a live recently-authenticated
  -- session. Reconciliation above deliberately does not require a second prompt.
  v_auth_evidence := private.studio2_require_fresh_auth(300);

  select show_row.*
  into v_before
  from public.shows show_row
  where show_row.id = p_show_id
    and show_row.edition_id = p_edition_id
  for update;

  if v_before.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if v_before.version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  -- Recompute dependency/publication state while the canonical Show row is
  -- locked. The preview is evidence, never permission to commit later.
  v_preflight := private.studio2_show_delete_preflight(p_edition_id, p_show_id);
  if coalesce((v_preflight #>> '{delete,allowed}')::boolean, false) is not true then
    raise sqlstate 'PT409' using
      message = 'STATE_CHANGED',
      detail = (v_preflight -> 'delete')::text,
      hint = 'Refresh the show lifecycle preview; permanent deletion is blocked by current canonical state.';
  end if;

  -- Keep the signed session/freshness proof on the protected operation receipt.
  -- studio2_reconcile_operation never exposes these columns to browser callers.
  update public.studio2_operation_receipts
  set
    actor_session_id = v_auth_evidence ->> 'sessionId',
    auth_freshness_evidence = v_auth_evidence,
    updated_at = now()
  where operation_id = v_operation_id
    and actor_id = auth.uid()
    and status = 'processing';

  if not found then
    raise exception using errcode = 'P0001', message = 'STATE_CHANGED';
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'show_deleted',
    'shows',
    v_before.id::text,
    v_before.edition_id,
    jsonb_build_object(
      'id', v_before.id,
      'name', v_before.name,
      'kind', v_before.kind,
      'sortOrder', v_before.sort_order,
      'status', v_before.status,
      'version', v_before.version,
      'reason', v_reason,
      'dependencies', v_preflight -> 'dependencies',
      'auth', v_auth_evidence - 'sessionId'
    ),
    null
  );

  delete from public.shows
  where id = p_show_id
    and edition_id = p_edition_id
    and version = p_expected_version;

  if not found then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'deleted', true,
    'stateVersion', p_expected_version,
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$delete_show$;

revoke all on function public.studio2_delete_show_v3(
  uuid, uuid, bigint, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_delete_show_v3(
  uuid, uuid, bigint, text, uuid, text, uuid
) to authenticated;

comment on function public.studio2_delete_show_v3(uuid, uuid, bigint, text, uuid, text, uuid) is
  'V3 R3 permanent Show deletion with fresh active-session proof retained on the S2 receipt, commit-time dependency preflight, CAS, audit and replay-safe reconciliation.';

notify pgrst, 'reload schema';

commit;
