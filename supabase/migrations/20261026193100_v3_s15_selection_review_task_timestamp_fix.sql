begin;

-- Forward-fix the S15 selection task projection before it can be invoked.
-- Confirmations entry rows do not own creation timestamps; the submission's
-- canonical submitted_at is the durable source for task age/order.

create or replace function private.studio2_reconcile_selection_review_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
begin
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
    edition_id, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
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
    edition_id, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
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

commit;
