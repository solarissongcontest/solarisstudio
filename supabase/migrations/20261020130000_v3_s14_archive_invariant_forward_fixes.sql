begin;

-- System V3 / S14 forward fix.
--
-- Archive is irreversible even for database owners and service-role workers.
-- Keep historical Task and delivery evidence stable, freeze current-workflow
-- data after Archive, and keep the legacy public edition status as a derived
-- compatibility projection of canonical studio2_edition_runtime while readers
-- finish cutting over.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-invariant-forward-fixes',
  3,
  'forward_fix_only',
  false,
  null,
  'Preserve irreversible Archive runtime state, historical Task and failed-delivery evidence, frozen current-workflow history, and the legacy public lifecycle compatibility projection.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if tg_op = 'INSERT' then
    if new.state = 'archived'
       and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
      raise exception 'Archive transition must use the canonical V3 lifecycle command.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.state = 'archived' then
      raise exception 'Archived edition runtime is irreversible.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.state = 'archived'
     and new.state is distinct from old.state then
    raise exception 'Archived edition runtime is irreversible.'
      using errcode = '42501';
  end if;

  if new.state = 'archived'
     and old.state is distinct from 'archived'
     and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
    raise exception 'Archive transition must use the canonical V3 lifecycle command.'
      using errcode = '42501';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archive_runtime_transition()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archive_runtime_insert
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_insert
before insert on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

drop trigger if exists v3_guard_archive_runtime_delete
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_delete
before delete on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

-- Public readers still consuming editions.status must not keep an archived
-- edition in an active/submissions presentation. studio2_edition_runtime stays
-- authoritative; this field is only a one-way compatibility projection.
create or replace function private.v3_sync_archived_edition_legacy_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $sync$
begin
  if new.state = 'archived'
     and (tg_op = 'INSERT' or old.state is distinct from new.state) then
    update public.editions
    set status = 'completed'
    where id = new.edition_id
      and status not in ('completed', 'finished');
  end if;
  return new;
end
$sync$;

revoke all on function private.v3_sync_archived_edition_legacy_status()
  from public, anon, authenticated;

drop trigger if exists v3_sync_archived_edition_legacy_status
  on public.studio2_edition_runtime;
create trigger v3_sync_archived_edition_legacy_status
after insert or update of state on public.studio2_edition_runtime
for each row execute function private.v3_sync_archived_edition_legacy_status();

update public.editions edition
set status = 'completed'
from public.studio2_edition_runtime runtime
where runtime.edition_id = edition.id
  and runtime.state = 'archived'
  and edition.status not in ('completed', 'finished');

create or replace function private.v3_guard_archived_legacy_edition_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $guard$
begin
  if new.status not in ('completed', 'finished')
     and exists (
       select 1
       from public.studio2_edition_runtime runtime
       where runtime.edition_id = new.id
         and runtime.state = 'archived'
     ) then
    raise exception 'Archived edition lifecycle is read-only.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_legacy_edition_status()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archived_legacy_edition_status on public.editions;
create trigger v3_guard_archived_legacy_edition_status
before update of status on public.editions
for each row execute function private.v3_guard_archived_legacy_edition_status();

-- Resolve the edition owned by a current-workflow row without making every
-- child table duplicate edition_id. Historical/audit rows are not passed
-- through this helper because they intentionally remain outside the freeze.
create or replace function private.v3_archived_workflow_row_edition(p_row jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $resolve$
declare
  v_id uuid;
begin
  if p_row is null then
    return null;
  end if;

  if nullif(p_row ->> 'edition_id', '') is not null then
    return (p_row ->> 'edition_id')::uuid;
  end if;

  if nullif(p_row ->> 'show_id', '') is not null then
    select show.edition_id
    into v_id
    from public.shows show
    where show.id = (p_row ->> 'show_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'submission_id', '') is not null then
    select submission.edition_id
    into v_id
    from public.submissions submission
    where submission.id = (p_row ->> 'submission_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'national_final_id', '') is not null then
    select submission.edition_id
    into v_id
    from public.national_finals national_final
    join public.submissions submission on submission.id = national_final.submission_id
    where national_final.id = (p_row ->> 'national_final_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'round_id', '') is not null then
    select round.edition_id
    into v_id
    from public.submission_rounds round
    where round.id = (p_row ->> 'round_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'source_submission_id', '') is not null then
    select submission.edition_id
    into v_id
    from public.submissions submission
    where submission.id = (p_row ->> 'source_submission_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'participant_id', '') is not null then
    select participant.edition_id
    into v_id
    from public.participants participant
    where participant.id = (p_row ->> 'participant_id')::uuid;
    return v_id;
  end if;

  if nullif(p_row ->> 'entry_id', '') is not null then
    select entry.edition_id
    into v_id
    from public.entries entry
    where entry.id = (p_row ->> 'entry_id')::uuid;
    return v_id;
  end if;

  return null;
end
$resolve$;

revoke all on function private.v3_archived_workflow_row_edition(jsonb)
  from public, anon, authenticated;

-- Freeze canonical current-contest workflow rows once the edition is archived.
-- Both OLD and NEW scope are checked so moving a row out of an archived edition
-- cannot be used to evade the terminal boundary. Dependent Entry/NF content is
-- scoped through its canonical parent instead of duplicating edition_id.
create or replace function private.v3_guard_archived_edition_workflow_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_old_edition_id uuid;
  v_new_edition_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_edition_id := private.v3_archived_workflow_row_edition(to_jsonb(old));
  end if;

  if tg_op <> 'DELETE' then
    v_new_edition_id := private.v3_archived_workflow_row_edition(to_jsonb(new));
  end if;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived'
      and runtime.edition_id in (v_old_edition_id, v_new_edition_id)
  ) then
    raise exception 'Archived edition workflow is read-only.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_workflow_write()
  from public, anon, authenticated;

do $install$
declare
  v_table text;
begin
  foreach v_table in array array[
    'submission_rounds',
    'submissions',
    'studio2_confirmation_requirements',
    'internal_entries',
    'national_finals',
    'national_final_entries',
    'next_in_line_submissions',
    'entries',
    'participants',
    'studio2_media_asset_reviews',
    'shows',
    'results',
    'voters',
    'jury_votes',
    'jury_ballot_statuses',
    'jury_ballot_submissions',
    'jury_voting_windows',
    'televotes',
    'televote_votes',
    'televoting_windows',
    'studio2_show_publication_controls',
    'studio2_result_operations'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'drop trigger if exists v3_guard_archived_edition_workflow_write on public.%I',
        v_table
      );
      execute format(
        'create trigger v3_guard_archived_edition_workflow_write before insert or update or delete on public.%I for each row execute function private.v3_guard_archived_edition_workflow_write()',
        v_table
      );
    end if;
  end loop;
end
$install$;

comment on function private.v3_guard_archived_edition_workflow_write() is
  'Fail-closed Archive boundary for current-workflow rows, including dependent Entry/NF content. Archive/history/audit/event evidence remains writable through its separate canonical stores.';

-- Archived current-workflow Task rows are retained history. New/reopened rows
-- are forced resolved, and DELETE is rejected so a privileged caller cannot
-- erase the original task identity or resolution timestamp.
create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if tg_op = 'DELETE' then
    if old.edition_id is not null
       and private.v3_archive_task_type_is_current_workflow(old.task_type)
       and exists (
         select 1
         from public.studio2_edition_runtime runtime
         where runtime.edition_id = old.edition_id
           and runtime.state = 'archived'
       ) then
      raise exception 'Archived edition workflow task history is read-only.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if new.edition_id is null
     or new.state = 'resolved'
     or not private.v3_archive_task_type_is_current_workflow(new.task_type) then
    return new;
  end if;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = new.edition_id
      and runtime.state = 'archived'
  ) then
    new.state := 'resolved';
    if tg_op = 'UPDATE' then
      new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    else
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    new.last_evaluated_at := now();
    new.updated_at := now();
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_task_resurrection()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archived_edition_task_resurrection
  on public.studio2_organizer_tasks;
create trigger v3_guard_archived_edition_task_resurrection
before insert or update or delete on public.studio2_organizer_tasks
for each row execute function private.v3_guard_archived_edition_task_resurrection();

comment on function private.v3_guard_archived_edition_task_resurrection() is
  'Retain archived current-workflow Task evidence: prevent deletion, prevent actionable resurrection, and preserve the original resolution timestamp.';

-- Keep the existing reconciler as the one source of derived Inbox/delivery
-- state. The final canonical prune call covers queue rows that predate the
-- Task trigger or have been restored with legacy event shapes. Failed delivery
-- attempts remain failed historical evidence and are not rewritten.
create or replace function private.v3_reconcile_resolved_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  update public.admin_notifications notification
  set resolved_at = coalesce(notification.resolved_at, task.resolved_at, now()),
      requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.notification_deliveries delivery
  set status = 'suppressed',
      processing_started_at = null,
      error = 'Organizer Task resolved before delivery.'
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing')
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;
  v_changed := v_changed + private.studio2_prune_stale_task_notifications(p_edition_id);

  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

comment on function private.v3_reconcile_resolved_task_notifications(uuid) is
  'Reconcile resolved Organizer Tasks into retained non-actionable Inbox evidence, suppress pending/in-flight task deliveries, and preserve failed attempts as immutable failure evidence.';

commit;
