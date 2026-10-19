begin;

-- System V3 / S14 forward fix.
--
-- The canonical Edition registry declares `edition.blocker` as Edition-owned
-- task vocabulary. Archive reconciliation already resolves legacy/current
-- edition.transition.* and edition.subsystem.* work, but it must also terminate
-- the canonical blocker task once the edition is irreversibly archived.
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
  'Align archived-edition task reconciliation with the canonical Edition task vocabulary by resolving edition.blocker alongside impossible current-contest workflow tasks.'
)
on conflict (migration_key) do nothing;

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
  -- impossible after Archive. `edition.blocker` is the canonical S1 Edition
  -- task; transition/subsystem names are retained compatibility task families.
  -- Incident/integrity/governance work is deliberately not included.
  update public.studio2_organizer_tasks task
  set state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
  where task.edition_id = p_edition_id
    and task.state <> 'resolved'
    and (
      task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast)\.'
      or task.task_type ~ '^edition\.(transition|subsystem)\.'
      or task.task_type = 'edition.blocker'
    );

  get diagnostics v_resolved = row_count;
  return v_resolved;
end
$resolve$;

revoke all on function private.v3_resolve_archived_edition_workflow_tasks(uuid)
  from public, anon, authenticated;

comment on function private.v3_resolve_archived_edition_workflow_tasks(uuid) is
  'Resolve archived-edition current-workflow Organizer tasks, including canonical edition.blocker, while preserving governance/history work.';

commit;
