begin;

-- Supabase projects may have default EXECUTE grants for API roles. These two
-- RPCs are authenticated workflows, so keep anonymous callers out at the
-- privilege boundary in addition to the ownership/organizer checks inside.
revoke execute on function public.update_owned_country_entry_listen_links(uuid, uuid, text, text, text) from anon;
revoke execute on function public.admin_update_country_entry_listen_links(uuid, uuid, uuid, text, text, text) from anon;

grant execute on function public.update_owned_country_entry_listen_links(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.admin_update_country_entry_listen_links(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
