begin;

-- Runtime release contract for UI/database compatibility.
--
-- The frontend must not expose V5 Organizer controls before the exact database
-- objects they depend on exist. This RPC is intentionally tiny and stable:
-- old databases simply do not have it, which the client treats as
-- incompatible instead of attempting feature RPCs and surfacing misleading
-- runtime failures.
--
-- Check exact function signatures, not only names. A stale overload must never
-- be mistaken for a compatible release contract. Also verify the supporting
-- tables/columns used by the current UI so a partially applied migration batch
-- remains fail-closed instead of presenting half-working controls.
--
-- This migration deliberately publishes a CORE schema id. The later final
-- task-reconciliation migration upgrades it to the COMPLETE schema id only
-- after every Organizer task source is wired into the canonical read path.

create or replace function public.studio2_runtime_contract()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with capability as (
    select
      (
        to_regprocedure('public.admin_organizer_tasks(uuid,text)') is not null
        and to_regprocedure('public.admin_organizer_task_count(uuid)') is not null
        and to_regclass('public.studio2_organizer_tasks') is not null
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
    'schemaId', 'organisation-os-v5-20261004-core',
    'ready', false,
    'capabilities', jsonb_build_object(
      'organizerTasks', capability.organizer_tasks,
      'systemOperations', capability.system_operations,
      'juryWindowOperations', capability.jury_window_operations
    )
  )
  from capability;
$$;

revoke all on function public.studio2_runtime_contract()
  from public, anon;
grant execute on function public.studio2_runtime_contract()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
