begin;

-- Solaris Studio V3 S15 / Worker 9: participation consequence runtime.
--
-- participation.status.* is already the governed R2 command boundary. This
-- migration adds the missing completed-fact DomainEvent and a deterministic
-- Organizer blocker projection for genuine canonical participation drift.
-- A legitimate withdrawn/disqualified status is NOT a blocker. A blocker exists
-- only when canonical participant rows disagree with each other, or an entry
-- already carrying a participation status disagrees with those participant rows.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s15.participation-consequences',
  1,
  'forward_fix_only',
  false,
  null,
  'Emit participation.changed from the existing idempotent R2 operation and reconcile participation.blocker from canonical participant/entry state drift.'
)
on conflict (migration_key) do nothing;

create or replace function private.studio2_participation_status_drifts(
  p_edition_id uuid default null
)
returns table (
  edition_id uuid,
  country_id uuid,
  contest_entity_id uuid,
  subject_key text,
  participant_statuses text[],
  entry_statuses text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $drift$
  with participant_state as (
    select
      participant.edition_id,
      participant.country_id,
      participant.contest_entity_id,
      private.studio2_participation_subject_key(
        participant.country_id,
        participant.contest_entity_id
      ) as subject_key,
      array_agg(
        distinct coalesce(participant.participation_status, 'confirmed')
        order by coalesce(participant.participation_status, 'confirmed')
      ) as participant_statuses
    from public.participants participant
    where (p_edition_id is null or participant.edition_id = p_edition_id)
      and private.studio2_participation_subject_key(
        participant.country_id,
        participant.contest_entity_id
      ) is not null
    group by
      participant.edition_id,
      participant.country_id,
      participant.contest_entity_id
  ),
  entry_state as (
    select
      entry.edition_id,
      entry.country_id,
      array_agg(distinct entry.status order by entry.status) filter (
        where entry.status in ('confirmed', 'withdrawn', 'disqualified')
      ) as entry_statuses
    from public.entries entry
    where (p_edition_id is null or entry.edition_id = p_edition_id)
    group by entry.edition_id, entry.country_id
  )
  select
    participant_state.edition_id,
    participant_state.country_id,
    participant_state.contest_entity_id,
    participant_state.subject_key,
    participant_state.participant_statuses,
    coalesce(entry_state.entry_statuses, '{}'::text[]) as entry_statuses
  from participant_state
  left join entry_state
    on participant_state.country_id is not null
   and entry_state.edition_id = participant_state.edition_id
   and entry_state.country_id = participant_state.country_id
  where cardinality(participant_state.participant_statuses) > 1
     or (
       cardinality(coalesce(entry_state.entry_statuses, '{}'::text[])) > 0
       and (
         cardinality(participant_state.participant_statuses) <> 1
         or cardinality(entry_state.entry_statuses) <> 1
         or participant_state.participant_statuses[1] is distinct from entry_state.entry_statuses[1]
       )
     );
$drift$;

revoke all on function private.studio2_participation_status_drifts(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_participation_blocker_tasks(
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
  where task.source_kind = 'participation_drift'
    and task.task_type = 'participation.blocker'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from private.studio2_participation_status_drifts(p_edition_id) drift
      where task.source_id = drift.edition_id::text || ':' || drift.subject_key
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
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    drift.edition_id,
    drift.country_id,
    'participation_drift',
    drift.edition_id::text || ':' || drift.subject_key,
    'participation-drift:' || drift.edition_id::text || ':' || drift.subject_key,
    'participation.blocker',
    'entry.approve',
    'critical',
    'open',
    'Participation state is inconsistent',
    'Canonical participation rows disagree for ' || drift.subject_key ||
      '. Participant state: ' || array_to_string(drift.participant_statuses, ', ') ||
      case
        when cardinality(drift.entry_statuses) > 0
          then '; entry state: ' || array_to_string(drift.entry_statuses, ', ')
        else ''
      end || '. Re-apply the authoritative participation status before relying on readiness or voting eligibility.',
    '/admin/participant-status/' || edition.slug,
    jsonb_build_object(
      'participantStatuses', to_jsonb(drift.participant_statuses),
      'entryStatuses', to_jsonb(drift.entry_statuses),
      'subjectKey', drift.subject_key,
      'resolvedWhen', 'all canonical participant rows and participation-status entry rows agree'
    ),
    now(),
    null,
    now(),
    now()
  from private.studio2_participation_status_drifts(p_edition_id) drift
  join public.editions edition on edition.id = drift.edition_id
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

revoke all on function private.studio2_reconcile_participation_blocker_tasks(uuid)
  from public, anon, authenticated;

-- Keep the latest aggregate reconciler intact and add the participation drift
-- projection beside the other deterministic task families.
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
  perform private.studio2_reconcile_participation_blocker_tasks(p_edition_id);
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
    'selection.winner_changed',
    'participation.changed'
  );
$allowed$;

revoke all on function private.v3_event_requires_shared_task_reconciliation(text)
  from public, anon, authenticated;

create or replace function private.v3_emit_participation_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_edition_id uuid;
  v_country_id uuid;
  v_contest_entity_id uuid;
  v_subject_key text;
  v_status text;
  v_version bigint;
  v_payload jsonb;
begin
  if new.status <> 'succeeded' or old.status = 'succeeded' then
    return new;
  end if;

  if new.command not in (
    'participation.status.confirmed',
    'participation.status.withdrawn',
    'participation.status.disqualified'
  ) then
    return new;
  end if;

  v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
  v_country_id := nullif(new.result ->> 'countryId', '')::uuid;
  v_contest_entity_id := nullif(new.result ->> 'contestEntityId', '')::uuid;
  v_status := nullif(new.result ->> 'status', '');
  v_version := nullif(new.result ->> 'version', '')::bigint;
  v_subject_key := private.studio2_participation_subject_key(
    v_country_id,
    v_contest_entity_id
  );

  if v_edition_id is null
     or v_subject_key is null
     or (v_country_id is null) = (v_contest_entity_id is null)
     or v_status not in ('confirmed', 'withdrawn', 'disqualified')
     or v_version is null
     or v_version < 1 then
    raise exception 'Successful participation operation has incomplete event provenance'
      using errcode = '23514';
  end if;

  if new.command <> 'participation.status.' || v_status then
    raise exception 'Participation operation command/result mismatch'
      using errcode = '23514';
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'editionId', v_edition_id,
    'countryId', v_country_id,
    'contestEntityId', v_contest_entity_id,
    'subjectKey', v_subject_key,
    'status', v_status,
    'previousVersion', nullif(new.result ->> 'previousVersion', '')::bigint,
    'updatedRows', nullif(new.result ->> 'updatedRows', '')::integer
  ));

  perform private.v3_emit_domain_event(
    'participation.changed',
    'participation',
    v_subject_key,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['system.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_participation_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_participation_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_participation_operation_event
after update of status, result
on public.studio2_operation_receipts
for each row execute function private.v3_emit_participation_operation_event();

notify pgrst, 'reload schema';

commit;
