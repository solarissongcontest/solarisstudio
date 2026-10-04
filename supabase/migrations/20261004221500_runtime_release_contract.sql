begin;

-- Runtime release contract for UI/database compatibility.
--
-- The frontend must not expose V5 Organizer controls before the database
-- objects they depend on exist. This RPC is intentionally tiny and stable:
-- old databases simply do not have it, which the client treats as
-- incompatible instead of attempting feature RPCs and surfacing misleading
-- runtime failures.

create or replace function public.studio2_runtime_contract()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  with capability as (
    select
      exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'admin_organizer_tasks'
      ) as organizer_tasks,
      exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'admin_system_runtime_health'
      ) as system_operations,
      (
        exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'studio2_jury_window_change_preview'
        )
        and exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = 'studio2_apply_jury_voting_status'
        )
      ) as jury_window_operations
  )
  select jsonb_build_object(
    'schemaId', 'organisation-os-v5-20261004',
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
$$;

revoke all on function public.studio2_runtime_contract()
  from public, anon;
grant execute on function public.studio2_runtime_contract()
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
