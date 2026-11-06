begin;

-- System V3 Selection winner coverage completion.
--
-- Confirmation submit/edit and Organizer historical restore can both change the
-- authoritative National Final winner outside the explicit winner button. Keep
-- one restore implementation, move it behind the S2 operation contract, retain
-- the old three-argument RPC only as a compatibility adapter, and emit Selection
-- facts from completed Confirmation/restore operation receipts.

alter function public.admin_restore_confirmation_version(uuid, uuid, text)
  rename to admin_restore_confirmation_version_legacy_impl;
revoke all on function public.admin_restore_confirmation_version_legacy_impl(uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.studio2_confirmation_restore_preview(
  p_submission_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_actor uuid := auth.uid();
  v_submission public.submissions%rowtype;
  v_target public.submission_versions%rowtype;
  v_review_version bigint;
  v_current_nf public.national_finals%rowtype;
  v_target_winner_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select submission.* into v_submission
  from public.submissions submission
  where submission.id = p_submission_id;
  if v_submission.id is null then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  -- Preserve the existing restore authorization boundary. The S2 envelope adds
  -- idempotency/CAS/evidence; it does not silently broaden who may restore.
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Confirmation restore access denied' using errcode = '42501';
  end if;

  select version.* into v_target
  from public.submission_versions version
  where version.id = p_version_id
    and version.submission_id = p_submission_id;
  if v_target.id is null then
    raise exception 'Historical version not found for this submission'
      using errcode = 'P0002';
  end if;

  begin
    v_target_winner_id := nullif(
      v_target.snapshot #>> '{national_final,winning_entry_id}',
      ''
    )::uuid;
  exception when invalid_text_representation then
    raise exception 'Historical version has invalid National Final winner provenance'
      using errcode = '23514';
  end;

  select final.* into v_current_nf
  from public.national_finals final
  where final.submission_id = p_submission_id
  limit 1;

  select version into v_review_version
  from public.studio2_confirmation_review_versions
  where submission_id = p_submission_id;

  return jsonb_build_object(
    'submissionId', v_submission.id,
    'editionId', v_submission.edition_id,
    'roundId', v_submission.round_id,
    'targetVersionId', v_target.id,
    'targetVersion', v_target.version,
    'expectedVersion', coalesce(v_review_version, 1),
    'currentNationalFinalId', v_current_nf.id,
    'currentWinnerEntryId', v_current_nf.winning_entry_id,
    'targetWinnerRequiresReview', v_target_winner_id is not null,
    'riskClass', 'R2'
  );
end
$preview$;

revoke all on function public.studio2_confirmation_restore_preview(uuid, uuid)
  from public, anon;
grant execute on function public.studio2_confirmation_restore_preview(uuid, uuid)
  to authenticated;

create or replace function public.studio2_apply_confirmation_restore(
  p_submission_id uuid,
  p_version_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_preview jsonb;
  v_round_id uuid;
  v_edition_id uuid;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint;
  v_restore_result jsonb;
  v_nf_before public.national_finals%rowtype;
  v_nf_after public.national_finals%rowtype;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Restore reason is required' using errcode = '22023';
  end if;

  v_preview := public.studio2_confirmation_restore_preview(
    p_submission_id,
    p_version_id
  );
  v_round_id := (v_preview ->> 'roundId')::uuid;
  v_edition_id := (v_preview ->> 'editionId')::uuid;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'entry.restore_version',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'submissionId', p_submission_id,
      'subjectType', 'submission',
      'subjectId', p_submission_id
    ),
    jsonb_build_object(
      'targetVersionId', p_version_id,
      'reason', btrim(p_reason),
      'expectedVersion', p_expected_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform 1
  from public.submission_rounds round
  where round.id = v_round_id
  for update;

  insert into public.studio2_confirmation_review_versions(
    submission_id, version, updated_at
  ) values (p_submission_id, 1, now())
  on conflict (submission_id) do nothing;

  select version into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = p_submission_id
  for update;

  if v_current_version is distinct from p_expected_version then
    raise exception using
      errcode = 'P0001',
      message = 'VERSION_CONFLICT',
      hint = 'Refresh the historical restore preview before retrying.';
  end if;

  select final.* into v_nf_before
  from public.national_finals final
  where final.submission_id = p_submission_id
  limit 1;

  v_restore_result := public.admin_restore_confirmation_version_legacy_impl(
    p_submission_id,
    p_version_id,
    btrim(p_reason)
  );

  select final.* into v_nf_after
  from public.national_finals final
  where final.submission_id = p_submission_id
  limit 1;

  select version into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = p_submission_id;

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'submissionId', p_submission_id,
    'editionId', v_edition_id,
    'restoredFromVersionId', p_version_id,
    'capturedVersion', v_restore_result -> 'captured_version',
    'winnerRequiresReview', v_restore_result -> 'winner_requires_review',
    'reviewVersion', v_current_version,
    'nationalFinalIdBefore', v_nf_before.id,
    'winnerEntryIdBefore', v_nf_before.winning_entry_id,
    'nationalFinalIdAfter', v_nf_after.id,
    'winnerEntryIdAfter', v_nf_after.winning_entry_id,
    'operationId', v_operation_id
  ));

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_restore(
  uuid, uuid, text, uuid, text, bigint, uuid
) from public, anon;
grant execute on function public.studio2_apply_confirmation_restore(
  uuid, uuid, text, uuid, text, bigint, uuid
) to authenticated;

-- Compatibility adapter: old callers still enter the same canonical S2 restore
-- authority. Stable semantic identity prevents a lost-response retry from
-- creating a second historical restore merely because the caller lacks the new
-- explicit operation-id parameters.
create or replace function public.admin_restore_confirmation_version(
  _submission_id uuid,
  _version_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $compat$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(_reason, '')), '');
  v_fingerprint text;
  v_operation_id uuid;
  v_existing public.studio2_operation_receipts%rowtype;
  v_preview jsonb;
  v_receipt jsonb;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Restore reason is required' using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'entry.restore_version.compatibility',
    'R2',
    jsonb_build_object(
      'submissionId', _submission_id,
      'subjectType', 'submission',
      'subjectId', _submission_id
    ),
    jsonb_build_object(
      'targetVersionId', _version_id,
      'reason', v_reason
    )
  );
  v_operation_id := (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;

  select receipt.* into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id;

  if v_existing.operation_id is not null then
    if v_existing.actor_id is distinct from v_actor
       or v_existing.command is distinct from 'entry.restore_version' then
      raise exception 'IDEMPOTENCY_CONFLICT: restore compatibility identity has different semantics'
        using errcode = '23505';
    end if;
    if v_existing.status = 'succeeded' then
      v_result := v_existing.result;
      return jsonb_build_object(
        'ok', true,
        'submission_id', v_result ->> 'submissionId',
        'captured_version', v_result -> 'capturedVersion',
        'restored_from_version_id', v_result ->> 'restoredFromVersionId',
        'winner_requires_review', coalesce((v_result ->> 'winnerRequiresReview')::boolean, false)
      );
    end if;
    raise exception 'Restore operation is already in progress'
      using errcode = '55000';
  end if;

  v_preview := public.studio2_confirmation_restore_preview(
    _submission_id,
    _version_id
  );
  v_receipt := public.studio2_apply_confirmation_restore(
    _submission_id,
    _version_id,
    v_reason,
    v_operation_id,
    v_operation_id::text,
    (v_preview ->> 'expectedVersion')::bigint,
    v_operation_id
  );
  v_result := v_receipt -> 'result';

  if v_receipt ->> 'status' <> 'succeeded'
     or not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'Canonical restore did not complete successfully'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_result ->> 'submissionId',
    'captured_version', v_result -> 'capturedVersion',
    'restored_from_version_id', v_result ->> 'restoredFromVersionId',
    'winner_requires_review', coalesce((v_result ->> 'winnerRequiresReview')::boolean, false)
  );
end
$compat$;

revoke all on function public.admin_restore_confirmation_version(uuid, uuid, text)
  from public, anon;
grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)
  to authenticated;

create or replace function private.v3_emit_selection_secondary_winner_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_submission public.submissions%rowtype;
  v_submission_id uuid;
  v_edition_id uuid;
  v_edit_count bigint;
  v_review_version bigint;
  v_previous_snapshot jsonb;
  v_previous_nf jsonb;
  v_previous_nf_id uuid;
  v_previous_winner_id uuid;
  v_current_nf public.national_finals%rowtype;
  v_before_nf_id uuid;
  v_before_winner_id uuid;
  v_after_nf_id uuid;
  v_after_winner_id uuid;
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  if new.command = 'confirmation.submit' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_edit_count := nullif(new.result ->> 'editCount', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Confirmation submit has invalid Selection provenance'
        using errcode = '23514';
    end;
    if v_submission_id is null or v_edit_count is null or v_edit_count < 0 then
      raise exception 'Completed Confirmation submit lacks Selection provenance'
        using errcode = '23514';
    end if;

    select submission.* into v_submission
    from public.submissions submission
    where submission.id = v_submission_id;
    if v_submission.id is null
       or v_submission.edit_count is distinct from v_edit_count then
      raise exception 'Completed Confirmation submit does not match canonical Selection state'
        using errcode = '23514';
    end if;
    v_edition_id := v_submission.edition_id;

    if v_edit_count > 0 then
      select version.snapshot into v_previous_snapshot
      from public.submission_versions version
      where version.submission_id = v_submission_id
        and version.version = v_edit_count
      order by version.created_at desc, version.id desc
      limit 1;
      if v_previous_snapshot is null then
        raise exception 'Edited Confirmation submit lacks its immutable pre-edit snapshot'
          using errcode = '23514';
      end if;
      v_previous_nf := case
        when jsonb_typeof(v_previous_snapshot -> 'national_final') = 'object'
          then v_previous_snapshot -> 'national_final'
        else null
      end;
      begin
        v_previous_nf_id := nullif(v_previous_nf ->> 'id', '')::uuid;
        v_previous_winner_id := nullif(v_previous_nf ->> 'winning_entry_id', '')::uuid;
      exception when invalid_text_representation then
        raise exception 'Confirmation pre-edit snapshot has invalid Selection identity'
          using errcode = '23514';
      end;
    end if;

    select final.* into v_current_nf
    from public.national_finals final
    where final.submission_id = v_submission_id
    limit 1;
    select version into v_review_version
    from public.studio2_confirmation_review_versions
    where submission_id = v_submission_id;
    if v_review_version is null then
      raise exception 'Confirmation submit lacks canonical Selection review version'
        using errcode = '23514';
    end if;

    if v_previous_nf_id is not distinct from v_current_nf.id then
      if v_previous_winner_id is distinct from v_current_nf.winning_entry_id
         and v_current_nf.id is not null then
        perform private.v3_emit_domain_event(
          'selection.winner_changed','national_selection',v_current_nf.id::text,
          v_review_version,new.operation_id,v_edition_id,null,
          jsonb_strip_nulls(jsonb_build_object(
            'submissionId',v_submission_id,'nationalFinalId',v_current_nf.id,
            'action',case when v_current_nf.winning_entry_id is null then 'clear' else 'select' end,
            'winnerEntryId',v_current_nf.winning_entry_id,'source','confirmation.submit'
          )),1,array[]::text[]
        );
      end if;
    else
      if v_previous_nf_id is not null and v_previous_winner_id is not null then
        perform private.v3_emit_domain_event(
          'selection.winner_changed','national_selection',v_previous_nf_id::text,
          v_review_version,new.operation_id,v_edition_id,null,
          jsonb_build_object(
            'submissionId',v_submission_id,'nationalFinalId',v_previous_nf_id,
            'action','clear','source','confirmation.submit'
          ),1,array[]::text[]
        );
      end if;
      if v_current_nf.id is not null and v_current_nf.winning_entry_id is not null then
        perform private.v3_emit_domain_event(
          'selection.winner_changed','national_selection',v_current_nf.id::text,
          v_review_version,new.operation_id,v_edition_id,null,
          jsonb_build_object(
            'submissionId',v_submission_id,'nationalFinalId',v_current_nf.id,
            'action','select','winnerEntryId',v_current_nf.winning_entry_id,
            'source','confirmation.submit'
          ),1,array[]::text[]
        );
      end if;
    end if;

  elsif new.command = 'entry.restore_version' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
      v_review_version := nullif(new.result ->> 'reviewVersion', '')::bigint;
      v_before_nf_id := nullif(new.result ->> 'nationalFinalIdBefore', '')::uuid;
      v_before_winner_id := nullif(new.result ->> 'winnerEntryIdBefore', '')::uuid;
      v_after_nf_id := nullif(new.result ->> 'nationalFinalIdAfter', '')::uuid;
      v_after_winner_id := nullif(new.result ->> 'winnerEntryIdAfter', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Completed Entry restore has invalid Selection provenance'
        using errcode = '23514';
    end;
    if v_submission_id is null
       or v_edition_id is null
       or v_review_version is null
       or v_review_version < 1 then
      raise exception 'Completed Entry restore lacks Selection provenance'
        using errcode = '23514';
    end if;

    if v_before_winner_id is not null then
      if v_before_nf_id is null then
        raise exception 'Restore winner clear lacks the prior National Final identity'
          using errcode = '23514';
      end if;
      if v_after_winner_id is not null then
        raise exception 'Historical restore unexpectedly retained an authoritative winner'
          using errcode = '23514';
      end if;
      perform private.v3_emit_domain_event(
        'selection.winner_changed','national_selection',v_before_nf_id::text,
        v_review_version,new.operation_id,v_edition_id,null,
        jsonb_strip_nulls(jsonb_build_object(
          'submissionId',v_submission_id,'nationalFinalId',v_before_nf_id,
          'action','clear','source','entry.restore_version',
          'replacementNationalFinalId',v_after_nf_id
        )),1,array[]::text[]
      );
    end if;
  else
    return new;
  end if;

  return new;
end
$emit$;

revoke all on function private.v3_emit_selection_secondary_winner_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_selection_secondary_winner_event
  on public.studio2_operation_receipts;
create trigger v3_emit_selection_secondary_winner_event
after update of status
on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_selection_secondary_winner_event();

-- Compatibility remains callable, but the implementation body is private from
-- application roles and every restore goes through the S2 preview/apply pair.
do $verify$
begin
  if has_function_privilege(
    'authenticated',
    'public.admin_restore_confirmation_version_legacy_impl(uuid,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.admin_restore_confirmation_version_legacy_impl(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Legacy direct restore implementation remains executable';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.studio2_confirmation_restore_preview(uuid,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.studio2_apply_confirmation_restore(uuid,uuid,text,uuid,text,bigint,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.admin_restore_confirmation_version(uuid,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Canonical Confirmation restore authority is not executable';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
