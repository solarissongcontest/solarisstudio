-- LOCAL fixture overlay: previously unmodelled ACL properties observed in the owner-authorized
-- 2026-11-13 catalog inspection. Not production SQL or permission to truncate.
begin;
-- Function bodies, owners and other security properties are verified separately.
revoke all on function private.v3_capture_result_version() from public,anon,authenticated,service_role;
revoke all on function private.studio2_prune_stale_task_notifications(uuid) from public,anon,authenticated,service_role;
revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid) from public,anon,authenticated,service_role;
grant truncate on table public.editions to anon;
grant truncate on table public.editions to service_role;
grant truncate on table public.editions to authenticated;
grant truncate on table public.notification_deliveries to anon;
grant truncate on table public.notification_deliveries to service_role;
grant truncate on table public.notification_deliveries to authenticated;
revoke truncate on table public.studio2_edition_runtime from anon;
grant truncate on table public.studio2_edition_runtime to service_role;
revoke truncate on table public.studio2_edition_runtime from authenticated;
revoke truncate on table public.studio2_organizer_tasks from anon;
grant truncate on table public.studio2_organizer_tasks to service_role;
revoke truncate on table public.studio2_organizer_tasks from authenticated;
commit;
