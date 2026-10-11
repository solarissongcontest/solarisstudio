begin;

-- admin_notifications is created after the legacy permission cutover migration.
-- On a clean replay that means its RLS policies exist but authenticated never
-- receives table privileges, so PostgREST fails with 403 before RLS can apply.
-- Keep the table least-privileged: Organizer clients may read their permitted
-- rows and mutate only the two acknowledgement fields used by the UI.
revoke all on table public.admin_notifications from public, anon, authenticated;
grant select on table public.admin_notifications to authenticated;
grant update (read_at, resolved_at) on table public.admin_notifications to authenticated;
grant all on table public.admin_notifications to service_role;

notify pgrst, 'reload schema';

commit;
