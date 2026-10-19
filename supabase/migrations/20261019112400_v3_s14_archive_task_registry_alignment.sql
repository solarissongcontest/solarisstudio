begin;

-- System V3 / S14 forward fix.
--
-- The canonical Edition registry declares `edition.blocker` as Edition-owned
-- task vocabulary. Archive reconciliation already resolves legacy/current
-- edition.transition.* and edition.subsystem.* work, but it must also terminate
-- the canonical blocker task once the edition is irreversibly archived.
--
-- More importantly, that rule is a database invariant rather than merely a
-- property of today's reconciliation function. Future task producers must not
-- be able to resurrect impossible current-contest work after Archive.
-- Governance/history task families remain intentionally untouched.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-task-registry-alignment',
  1,
  'forward_fix_only',
  false,
  null,
  'Align archived-edition task reconciliation with canonical Edition task vocabulary and enforce non-resurrection of impossible current-contest tasks at the task-table boundary.'
)
on conflict (migration_key) do nothing;

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
    coalesce(p_task_type, '') ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast)\.'
    or coalesce(p_task_type, '') ~ '^edition\.(transition|subsystem)\.'
    or coalesce(p_task_type, '') = 'edition.blocker';
$candidate$;

revoke all on function private.v3_archive_task_type_is_current_workflow(text)
  from public, anon, authenticated;

create or replace function private.v3_resolve_archived_edition_workflow_tasks(
  p_edition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_resolved integer := 0;
begin
  if p_edition_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = p_edition_id
      and runtime.state = 'archived'
  ) then
    return 0;
  end if;

  -- Resolve only current-contest operational work whose underlying mutation is
  -- impossible after Archive. Incident/integrity/governance work is deliberately
  -- not part of the candidate vocabulary above.
  update public.studio2_organizer_tasks task
  set state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
  where task.edition_id = p_edition_id
    and task.state <> 'resolved'
    and private.v3_archive_task_type_is_current_workflow(task.task_type);

  get diagnostics v_resolved = row_count;
  return v_resolved;
end
$resolve$;

revoke all on function private.v3_resolve_archived_edition_workflow_tasks(uuid)
  from public, anon, authenticated;

comment on function private.v3_resolve_archived_edition_workflow_tasks(uuid) is
  'Resolve archived-edition current-workflow Organizer tasks, including canonical edition.blocker, while preserving governance/history work.';

create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
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
    new.resolved_at := coalesce(new.resolved_at, now());
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
before insert or update on public.studio2_organizer_tasks
for each row execute function private.v3_guard_archived_edition_task_resurrection();

comment on function private.v3_guard_archived_edition_task_resurrection() is
  'Fail-safe task projection invariant: impossible current-workflow tasks for archived editions remain historical rows but cannot become actionable again.';

commit;
