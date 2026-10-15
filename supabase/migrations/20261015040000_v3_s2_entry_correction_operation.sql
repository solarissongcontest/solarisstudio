begin;

-- First S2 vertical slice: move the existing immutable Entry review workflow
-- onto the canonical command, fingerprint, receipt and reconciliation contract.
-- This deliberately reuses studio2_operation_receipts and the existing Entry
-- mutation; DomainEvent/outbox consequences remain an S4 concern.
drop function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint, uuid
);

create or replace function public.studio2_apply_confirmation_entry_review(
  p_target_type text,
  p_entry_id uuid,
  p_target_status text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint,
  p_expected_entry_version uuid default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_context jsonb;
  v_target_type text := lower(btrim(coalesce(p_target_type, '')));
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_submission_id uuid;
  v_edition_id uuid;
  v_current_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_command text;
  v_result jsonb;
begin
  v_context := private.studio2_confirmation_review_context(
    v_target_type,
    p_entry_id
  );
  v_submission_id := (v_context ->> 'submissionId')::uuid;
  v_edition_id := (v_context ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_target_status not in ('pending', 'accepted', 'declined', 'removed') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_target_status <> 'accepted' and v_reason is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_command := case v_target_status
    when 'declined' then 'entry.request_changes'
    when 'accepted' then 'entry.accept'
    when 'removed' then 'entry.remove'
    else 'entry.reset_review'
  end;

  -- Claim before mutable-state validation so a lost-response retry can replay
  -- its completed result even though the original transaction advanced CAS.
  -- New claims still validate every version and invariant before mutation.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'submissionId', v_submission_id,
      'subjectType', 'entry',
      'subjectId', p_entry_id
    ),
    jsonb_build_object(
      'submissionId', v_submission_id,
      'entryId', p_entry_id,
      'targetType', v_target_type,
      'targetStatus', v_target_status,
      'reason', v_reason,
      'expectedVersion', p_expected_version,
      'expectedEntryVersion', p_expected_entry_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  -- Lock the entry before the submission CAS row, matching content-writer order.
  if v_target_type = 'internal' then
    perform 1 from public.internal_entries where id = p_entry_id for update;
  else
    perform 1 from public.national_final_entries where id = p_entry_id for update;
  end if;

  v_context := private.studio2_confirmation_review_context(v_target_type, p_entry_id);
  if (v_context ->> 'currentVersionId')::uuid is distinct from p_expected_entry_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id
  for update;

  if coalesce(v_current_version, 1) is distinct from p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  -- Preflight is evidence, not permission. Repeat every target-state and winner
  -- invariant inside the authoritative mutation transaction.
  perform public.studio2_confirmation_entry_review_preview(
    v_target_type,
    p_entry_id,
    v_target_status
  );

  if v_target_type = 'internal' then
    update public.internal_entries
    set
      review_status = v_target_status,
      review_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_entry_id;
  else
    update public.national_final_entries
    set
      review_status = v_target_status,
      review_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      removed = v_target_status = 'removed',
      removed_at = case when v_target_status = 'removed' then now() else null end
    where id = p_entry_id;
  end if;

  insert into public.submission_review_history (
    submission_id,
    target_type,
    target_entry_id,
    artist_snapshot,
    song_title_snapshot,
    action,
    reason,
    admin_user_id
  )
  values (
    v_submission_id,
    v_target_type,
    p_entry_id,
    v_context ->> 'artist',
    v_context ->> 'songTitle',
    v_target_status,
    coalesce(v_reason, 'Accepted by organiser'),
    auth.uid()
  );

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id;

  v_result := jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'entryId', p_entry_id,
    'entryVersionId', p_expected_entry_version,
    'targetType', v_target_type,
    'status', v_target_status,
    'reviewState', case
      when v_target_status = 'declined' then 'changes_requested'
      else v_target_status
    end,
    'version', v_current_version,
    'operationId', v_operation_id
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint, uuid, uuid
) from public, anon;
grant execute on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint, uuid, uuid
) to authenticated, service_role;

comment on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint, uuid, uuid
) is
  'S2 canonical Entry review transition with semantic idempotency, exact revision binding and a durable operation receipt.';

notify pgrst, 'reload schema';

commit;
