begin;

-- Organisation OS V5 jury-ballot domain truth projection.
--
-- Country-facing submission reminders stop once the participant has submitted.
-- Organizer-facing validation remains independently actionable until the
-- submitted evidence is Valid, Invalidated or Superseded.

create or replace function private.studio2_reconcile_jury_ballot_review_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
begin
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'jury_ballot_review'
    and not exists (
      select 1
      from public.jury_ballot_submissions ballot
      where ballot.id::text = task.source_id
        and ballot.status in ('submitted', 'needs_review')
        and (
          p_edition_id is null
          or ballot.edition_id = p_edition_id
        )
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
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
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    ballot.edition_id,
    ballot.voter_country_id,
    'jury_ballot_review',
    ballot.id::text,
    'jury-ballot-review:' || ballot.id::text,
    'jury.ballot.review',
    'jury.ballots.manage',
    case
      when ballot.status = 'needs_review' or ballot.risk_score >= 80 then 'critical'
      else 'high'
    end,
    'open',
    case
      when ballot.status = 'needs_review' then 'Review flagged jury ballot'
      else 'Validate submitted jury ballot'
    end,
    'Participant-submitted jury evidence is waiting for an Organizer validation state. Submitted content is immutable; review only changes the lifecycle around it.',
    '/admin/jury/' || edition.slug || '?show=' || ballot.show_id::text,
    null,
    jsonb_build_object(
      'table', 'jury_ballot_submissions',
      'id', ballot.id,
      'resolvedWhen', jsonb_build_array('valid', 'invalidated', 'superseded'),
      'currentStatus', ballot.status,
      'reviewVersion', ballot.review_version
    ),
    ballot.submitted_at,
    null,
    now(),
    now()
  from public.jury_ballot_submissions ballot
  join public.editions edition on edition.id = ballot.edition_id
  where ballot.status in ('submitted', 'needs_review')
    and (p_edition_id is null or ballot.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
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

revoke all on function private.studio2_reconcile_jury_ballot_review_tasks(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_jury_ballot_review_task_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  perform private.studio2_reconcile_jury_ballot_review_tasks(new.edition_id);
  perform private.studio2_sync_task_notifications(new.edition_id);
  perform private.studio2_prune_stale_task_notifications(new.edition_id);
  return null;
end
$trigger$;

revoke all on function private.studio2_jury_ballot_review_task_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_jury_ballot_review_task_reconcile
  on public.jury_ballot_submissions;
create trigger studio2_jury_ballot_review_task_reconcile
after insert or update of status, review_version on public.jury_ballot_submissions
for each row
execute function private.studio2_jury_ballot_review_task_trigger();

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

select private.studio2_reconcile_jury_ballot_review_tasks(null);

notify pgrst, 'reload schema';

commit;
