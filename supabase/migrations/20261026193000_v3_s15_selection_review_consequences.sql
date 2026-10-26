begin;

-- Solaris Studio V3 S15 / Worker 9: Selection review consequences.
--
-- The selection review and National Final winner commands are already the
-- authoritative, version-bound, idempotent write boundary. This migration
-- connects those successful operation receipts to the canonical DomainEvent
-- outbox and adds the missing deterministic Organizer review-task projection.
-- No public copy of winner/review truth is introduced: Public readback remains
-- the canonical submission/National Final state written by the command.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s15.selection-review-consequences',
  1,
  'forward_fix_only',
  false,
  null,
  'Emit selection.reviewed/selection.winner_changed from successful canonical operation receipts and rebuild selection.review_required tasks from authoritative selection state.'
)
on conflict (migration_key) do nothing;

-- Selection review is current-contest work. Preserve the S14 non-resurrection
-- invariant when this newly explicit task family is rebuilt after Archive.
create or replace function private.v3_archive_task_type_is_current_workflow(
  p_task_type text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $candidate$
  select
    coalesce(p_task_type, '') ~ '^(confirmation|entry|selection|media|participation|jury|televote|results|publication|show|broadcast)\.'
    or coalesce(p_task_type, '') ~ '^edition\.(transition|subsystem)\.'
    or coalesce(p_task_type, '') = 'edition.blocker';
$candidate$;

revoke all on function private.v3_archive_task_type_is_current_workflow(text)
  from public, anon, authenticated;

-- One task per concrete pending candidate review. Winner selection itself is
-- canonical selection state and does not create a second manual housekeeping
-- task. A winner change still re-runs this reconciler because it can alter the
-- public accepted-selection readback without changing task authority.
create or replace function private.studio2_reconcile_selection_review_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
begin
  -- Resolve rows whose canonical review condition disappeared or became
  -- terminal. Keep the row as history; task state is never browser-owned.
  update public.studio2_organizer_tasks task
  set state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
  where task.source_kind = 'selection_review'
    and task.task_type = 'selection.review_required'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.internal_entries entry
      join public.submissions submission on submission.id = entry.submission_id
      where task.source_id = 'internal:' || entry.id::text
        and submission.edition_id = task.edition_id
        and submission.participating = true
        and submission.selection_method = 'internal'
        and coalesce(submission.entry_unknown, false) = false
        and nullif(btrim(entry.song_title), '') is not null
        and entry.review_status = 'pending'

      union all

      select 1
      from public.national_final_entries entry
      join public.national_finals nf on nf.id = entry.national_final_id
      join public.submissions submission on submission.id = nf.submission_id
      where task.source_id = 'national_final:' || entry.id::text
        and submission.edition_id = task.edition_id
        and submission.participating = true
        and submission.selection_method = 'national_final'
        and coalesce(submission.nf_entries_unknown, false) = false
        and coalesce(entry.removed, false) = false
        and entry.review_status = 'pending'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    submission.edition_id,
    'selection_review',
    'internal:' || entry.id::text,
    'selection_review:internal:' || entry.id::text,
    'selection.review_required',
    'confirmation.manage',
    'normal',
    'open',
    'Internal selection entry needs review',
    coalesce(nullif(btrim(entry.artist), ''), 'Unknown artist') || ' · ' ||
      coalesce(nullif(btrim(entry.song_title), ''), 'Untitled song'),
    '/confirmations/admin/responses/' || submission.id::text,
    jsonb_build_object(
      'table', 'internal_entries',
      'id', entry.id,
      'field', 'review_status',
      'resolvedWhen', jsonb_build_array('accepted', 'declined')
    ),
    coalesce(submission.submitted_at, now()),
    null,
    now(),
    now()
  from public.internal_entries entry
  join public.submissions submission on submission.id = entry.submission_id
  where submission.participating = true
    and submission.selection_method = 'internal'
    and coalesce(submission.entry_unknown, false) = false
    and nullif(btrim(entry.song_title), '') is not null
    and entry.review_status = 'pending'
    and (p_edition_id is null or submission.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    submission.edition_id,
    'selection_review',
    'national_final:' || entry.id::text,
    'selection_review:national_final:' || entry.id::text,
    'selection.review_required',
    'confirmation.manage',
    'normal',
    'open',
    'National Final candidate needs review',
    coalesce(nullif(btrim(entry.artist), ''), 'Unknown artist') || ' · ' ||
      coalesce(nullif(btrim(entry.song_title), ''), 'Untitled song'),
    '/confirmations/admin/responses/' || submission.id::text,
    jsonb_build_object(
      'table', 'national_final_entries',
      'id', entry.id,
      'field', 'review_status',
      'resolvedWhen', jsonb_build_array('accepted', 'declined', 'removed')
    ),
    coalesce(submission.submitted_at, now()),
    null,
    now(),
    now()
  from public.national_final_entries entry
  join public.national_finals nf on nf.id = entry.national_final_id
  join public.submissions submission on submission.id = nf.submission_id
  where submission.participating = true
    and submission.selection_method = 'national_final'
    and coalesce(submission.nf_entries_unknown, false) = false
    and coalesce(entry.removed, false) = false
    and entry.review_status = 'pending'
    and (p_edition_id is null or submission.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();
end
$reconcile$;

revoke all on function private.studio2_reconcile_selection_review_tasks(uuid)
  from public, anon, authenticated;

-- Register the new projection in the canonical aggregate rebuild rather than
-- relying solely on event delivery. That is what allows drift repair after a
-- failed/partial consumer run.
create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  insert into private.v3_archive_task_reconciliation_gates (
    edition_id,
    transaction_id
  )
  select runtime.edition_id, txid_current()
  from public.studio2_edition_runtime runtime
  where runtime.state = 'archived'
    and (p_edition_id is null or runtime.edition_id = p_edition_id)
  on conflict do nothing;

  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_selection_review_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();

  if p_edition_id is not null then
    perform private.v3_resolve_archived_edition_workflow_tasks(p_edition_id);
  else
    perform private.v3_resolve_archived_edition_workflow_tasks(runtime.edition_id)
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived';
  end if;

  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.v3_reconcile_resolved_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);

  delete from private.v3_archive_task_reconciliation_gates gate
  where gate.transaction_id = txid_current()
    and (p_edition_id is null or gate.edition_id = p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)
  to service_role;

-- Extend the shared task consumer only after this domain has both a real
-- producer and a rebuildable task projection.
create or replace function private.v3_event_requires_shared_task_reconciliation(
  p_event_type text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $allowed$
  select p_event_type in (
    'edition.transitioned',
    'selection.reviewed',
    'selection.winner_changed'
  );
$allowed$;

revoke all on function private.v3_event_requires_shared_task_reconciliation(text)
  from public, anon, authenticated;

create or replace function private.v3_emit_selection_operation_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_submission_id uuid;
  v_edition_id uuid;
  v_entry_id uuid;
  v_national_final_id uuid;
  v_version bigint;
  v_target_type text;
  v_status text;
  v_action text;
  v_winner_entry_id uuid;
  v_payload jsonb;
begin
  if new.status <> 'succeeded' or old.status = 'succeeded' then
    return new;
  end if;

  -- Entry review uses shared Entry command vocabulary, so discriminate the
  -- selection surface by the bounded result contract rather than command text
  -- alone. Other Entry operations must not fabricate selection events.
  if new.command in ('entry.request_changes', 'entry.accept', 'entry.remove', 'entry.reset_review')
     and coalesce(new.result ->> 'targetType', '') in ('internal', 'national_final') then
    v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
    v_entry_id := nullif(new.result ->> 'entryId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
    v_target_type := nullif(new.result ->> 'targetType', '');
    v_status := nullif(new.result ->> 'status', '');

    select submission.edition_id
    into v_edition_id
    from public.submissions submission
    where submission.id = v_submission_id;

    if v_submission_id is null
       or v_entry_id is null
       or v_edition_id is null
       or v_version is null
       or v_version < 1
       or v_target_type not in ('internal', 'national_final')
       or v_status not in ('pending', 'accepted', 'declined', 'removed') then
      raise exception 'Successful selection review operation has incomplete event provenance'
        using errcode = '23514';
    end if;

    v_payload := jsonb_build_object(
      'submissionId', v_submission_id,
      'entryId', v_entry_id,
      'targetType', v_target_type,
      'reviewStatus', v_status,
      'reviewState', coalesce(new.result ->> 'reviewState', v_status)
    );

    perform private.v3_emit_domain_event(
      'selection.reviewed',
      'selection_entry',
      v_entry_id::text,
      v_version,
      new.operation_id,
      v_edition_id,
      null,
      v_payload,
      1,
      array['system.tasks']::text[]
    );

    return new;
  end if;

  if new.command in ('confirmation.nf_winner.select', 'confirmation.nf_winner.clear') then
    v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
    v_national_final_id := nullif(new.result ->> 'nationalFinalId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
    v_action := nullif(new.result ->> 'action', '');
    v_winner_entry_id := nullif(new.result ->> 'winnerEntryId', '')::uuid;

    select submission.edition_id
    into v_edition_id
    from public.submissions submission
    where submission.id = v_submission_id;

    if v_submission_id is null
       or v_national_final_id is null
       or v_edition_id is null
       or v_version is null
       or v_version < 1
       or v_action not in ('select', 'clear')
       or (v_action = 'select' and v_winner_entry_id is null)
       or (v_action = 'clear' and v_winner_entry_id is not null) then
      raise exception 'Successful National Final winner operation has incomplete event provenance'
        using errcode = '23514';
    end if;

    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'submissionId', v_submission_id,
      'nationalFinalId', v_national_final_id,
      'action', v_action,
      'winnerEntryId', v_winner_entry_id
    ));

    perform private.v3_emit_domain_event(
      'selection.winner_changed',
      'national_final',
      v_national_final_id::text,
      v_version,
      new.operation_id,
      v_edition_id,
      null,
      v_payload,
      1,
      array['system.tasks']::text[]
    );
  end if;

  return new;
end
$emit$;

revoke all on function private.v3_emit_selection_operation_events()
  from public, anon, authenticated;

drop trigger if exists v3_emit_selection_operation_events
  on public.studio2_operation_receipts;
create trigger v3_emit_selection_operation_events
after update of status, result
on public.studio2_operation_receipts
for each row execute function private.v3_emit_selection_operation_events();

notify pgrst, 'reload schema';

commit;
