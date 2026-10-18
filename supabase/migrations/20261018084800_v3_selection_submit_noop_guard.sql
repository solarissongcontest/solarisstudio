begin;

-- A successful Confirmation submit is not automatically a Selection mutation.
-- Only require Selection review-version provenance once the before/after
-- National Final winner state proves that a selection.winner_changed fact must
-- be emitted. This keeps unrelated Confirmation submits outside Selection while
-- preserving fail-closed provenance for real winner changes.
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
  v_winner_changed boolean := false;
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

    if v_previous_nf_id is not distinct from v_current_nf.id then
      v_winner_changed :=
        v_current_nf.id is not null
        and v_previous_winner_id is distinct from v_current_nf.winning_entry_id;
    else
      v_winner_changed :=
        (v_previous_nf_id is not null and v_previous_winner_id is not null)
        or (v_current_nf.id is not null and v_current_nf.winning_entry_id is not null);
    end if;

    -- A normal Confirmation submit with no National Final winner transition is
    -- not a Selection event and must not require Selection-specific ledgers.
    if not v_winner_changed then
      return new;
    end if;

    select version into v_review_version
    from public.studio2_confirmation_review_versions
    where submission_id = v_submission_id;
    if v_review_version is null then
      raise exception 'Confirmation winner change lacks canonical Selection review version'
        using errcode = '23514';
    end if;

    if v_previous_nf_id is not distinct from v_current_nf.id then
      perform private.v3_emit_domain_event(
        'selection.winner_changed','national_selection',v_current_nf.id::text,
        v_review_version,new.operation_id,v_edition_id,null,
        jsonb_strip_nulls(jsonb_build_object(
          'submissionId',v_submission_id,'nationalFinalId',v_current_nf.id,
          'action',case when v_current_nf.winning_entry_id is null then 'clear' else 'select' end,
          'winnerEntryId',v_current_nf.winning_entry_id,'source','confirmation.submit'
        )),1,array[]::text[]
      );
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

commit;
