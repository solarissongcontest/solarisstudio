begin;

-- Final Organizer Task runtime reconciliation.
--
-- Several V5 migrations extend private.studio2_reconcile_all_organizer_tasks as
-- new task sources are introduced. A later migration can accidentally replace
-- that wrapper with a version that omits an earlier source. That happened when
-- jury-ballot tasks were added after system-job tasks, and confirmation-sync
-- recovery was later trigger-only. The Organizer Tasks page must reconcile the
-- complete source set every time it asks for authoritative task truth.

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
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- Publish the COMPLETE runtime identity only now. The frontend accepts this
-- exact schema id and therefore cannot enable V5 Organizer controls during a
-- partially applied database cutover.
create or replace function public.studio2_runtime_contract()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $contract$
  with capability as (
    select
      (
        to_regprocedure('public.admin_organizer_tasks(uuid,text)') is not null
        and to_regprocedure('public.admin_organizer_task_count(uuid)') is not null
        and to_regclass('public.studio2_organizer_tasks') is not null
        and to_regprocedure(
          'private.studio2_reconcile_all_organizer_tasks(uuid)'
        ) is not null
        and to_regprocedure(
          'private.studio2_reconcile_system_job_tasks()'
        ) is not null
        and to_regprocedure(
          'private.studio2_reconcile_jury_ballot_review_tasks(uuid)'
        ) is not null
        and to_regprocedure(
          'private.studio2_reconcile_confirmation_sync_tasks()'
        ) is not null
      ) as organizer_tasks,
      (
        to_regprocedure('public.admin_system_runtime_health(integer)') is not null
        and to_regprocedure(
          'public.admin_retry_failed_notification_delivery(uuid,uuid,text)'
        ) is not null
        and to_regclass('public.notification_deliveries') is not null
        and (
          select count(*)
          from information_schema.columns column_info
          where column_info.table_schema = 'public'
            and column_info.table_name = 'notification_deliveries'
            and column_info.column_name in (
              'provider_accepted_at',
              'received_at',
              'displayed_at',
              'receipt_token_hash'
            )
        ) = 4
      ) as system_operations,
      (
        to_regprocedure(
          'public.studio2_jury_window_change_preview(uuid,text)'
        ) is not null
        and to_regprocedure(
          'public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)'
        ) is not null
        and to_regclass('public.studio2_jury_window_versions') is not null
      ) as jury_window_operations
  )
  select jsonb_build_object(
    'schemaId', 'organisation-os-v5-20261004-complete',
    'ready',
      capability.organizer_tasks
      and capability.system_operations
      and capability.jury_window_operations,
    'capabilities', jsonb_build_object(
      'organizerTasks', capability.organizer_tasks,
      'systemOperations', capability.system_operations,
      'juryWindowOperations', capability.jury_window_operations
    )
  )
  from capability;
$contract$;

revoke all on function public.studio2_runtime_contract()
  from public, anon;
grant execute on function public.studio2_runtime_contract()
  to authenticated, service_role;

-- Re-evaluate the existing task table once after cutover. This does not execute
-- domain actions; it only projects current authoritative domain conditions into
-- Organizer Tasks and their existing notification projection.
select private.studio2_reconcile_all_organizer_tasks(null);

notify pgrst, 'reload schema';

commit;
